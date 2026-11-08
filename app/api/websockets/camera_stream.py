"""WebSocket endpoint handling real-time camera streaming with decoupled asynchronous architecture.

Architecture:
  - 1 WebSocket Reader Task: Reads incoming frames and control messages without blocking.
  - 1 Bounded Input Queue: Holds latest incoming frame (maxsize=1) with newest-frame replacement.
  - 1 Inference Worker Task: Dequeues frame, executes model inference and ByteTrack.
  - 1 Controlled Writer Task: Writes paired JSON telemetry and binary annotated frames.
"""

import asyncio
import json
import logging
import struct
import time
import uuid
from typing import Any

from fastapi import APIRouter, WebSocket, WebSocketDisconnect, status
from starlette.concurrency import run_in_threadpool

from app.api.dependencies import get_camera_service
from app.config import settings
from app.services.stream_manager import stream_manager
from app.services.ticket_manager import ticket_manager

logger = logging.getLogger(__name__)
router = APIRouter(tags=["Stream"])


def _is_origin_allowed(websocket: WebSocket) -> bool:
    """Verifies WebSocket handshake Origin header against configured CORS origins."""
    if "*" in settings.cors_origins:
        # Wildcard origins are forbidden in authenticated public deployments
        if settings.access_token:
            logger.warning(
                "WebSocket rejected: wildcard '*' CORS origin not allowed for authenticated deployments."
            )
            return False
        return True

    origin = websocket.headers.get("origin")
    if not origin:
        # Reject missing Origin headers by default for browser streaming
        if not settings.allow_originless_ws:
            logger.warning("WebSocket rejected: missing Origin header.")
            return False
        return True

    cleaned_origins = {o.rstrip("/") for o in settings.cors_origins}
    return origin.rstrip("/") in cleaned_origins


@router.websocket("/stream")
async def websocket_camera_stream(
    websocket: WebSocket,
) -> None:
    """Real-time bi-directional camera streaming endpoint with ticket authentication and origin validation.

    Protocol:
      1. Origin Check: Validates WebSocket Origin against settings.cors_origins.
      2. Authentication: Strictly requires single-use ?ticket= query param via ticket_manager if access_token is configured.
      3. Concurrency: Atomically reserves a session slot before accepting handshake.
      4. Asynchronous Pipeline:
         - Reader: Ingests frames and immediately handles control messages (config, reset_tracker).
         - Bounded Queue: Discards oldest stale frame when worker is busy, preventing buffer accumulation.
         - Worker: Executes inference and ByteTrack in non-blocking threadpool.
         - Writer: Dispatches paired JSON metadata and annotated JPEG frames.
    """
    # 1. Validate Origin header
    if not _is_origin_allowed(websocket):
        logger.warning(
            "WebSocket rejected: Origin '%s' not permitted in cors_origins.",
            websocket.headers.get("origin"),
        )
        await websocket.close(code=status.WS_1008_POLICY_VIOLATION)
        return

    # 2. Validate single-use ticket if access token is required (no permanent token fallback)
    if settings.access_token:
        ticket = websocket.query_params.get("ticket")
        if not ticket or not ticket_manager.consume_ticket(ticket):
            logger.warning("WebSocket rejected: invalid, expired, or missing single-use ticket.")
            await websocket.close(code=status.WS_1008_POLICY_VIOLATION)
            return

    session_id = str(uuid.uuid4())

    # 3. Atomic concurrency slot reservation
    if not stream_manager.reserve_slot(session_id):
        logger.warning(
            "WebSocket rejected: max concurrent streams (%d) reached.",
            settings.max_concurrent_streams,
        )
        await websocket.close(code=status.WS_1013_TRY_AGAIN_LATER)
        return

    await websocket.accept()

    session = stream_manager.create_session(session_id=session_id)
    camera_service = get_camera_service()

    logger.info("WebSocket connected. Session: %s", session_id)

    # Decoupled Asynchronous Pipeline Queues
    # Bounded input queue: maxsize=1 ensures only the freshest frame is queued
    input_queue: asyncio.Queue[tuple[int, bytes, float]] = asyncio.Queue(maxsize=1)
    # Controlled output queue: paired metadata and frames
    output_queue: asyncio.Queue[tuple[str, Any]] = asyncio.Queue(maxsize=4)

    async def _read_loop() -> None:
        auto_frame_id = 0
        while True:
            message = await websocket.receive()

            # Handle text control messages
            if "text" in message:
                try:
                    payload = json.loads(message["text"])
                    msg_type = payload.get("type", "config")

                    if msg_type == "config":
                        session.update_config(
                            confidence_threshold=payload.get(
                                "confidence_threshold", session.config.confidence_threshold
                            ),
                            iou_threshold=payload.get(
                                "iou_threshold", session.config.iou_threshold
                            ),
                            filter_classes=payload.get(
                                "filter_classes", session.config.filter_classes
                            ),
                            skip_interval=payload.get(
                                "skip_interval", session.config.skip_interval
                            ),
                            return_annotated_frame=payload.get(
                                "return_annotated_frame", session.config.return_annotated_frame
                            ),
                            jpeg_quality=payload.get(
                                "jpeg_quality", session.config.jpeg_quality
                            ),
                            enable_tracking=payload.get(
                                "enable_tracking", session.config.enable_tracking
                            ),
                            enable_trails=payload.get(
                                "enable_trails", session.config.enable_trails
                            ),
                            trace_length=payload.get(
                                "trace_length", session.config.trace_length
                            ),
                            target_fps=payload.get(
                                "target_fps", session.config.target_fps
                            ),
                            image_size=payload.get(
                                "image_size", getattr(session.config, "image_size", 416)
                            ),
                        )
                        await output_queue.put(
                            ("text", json.dumps({"type": "config_ack", "status": "ok"}))
                        )

                    elif msg_type == "reset_tracker":
                        # Deterministic Reset: Drain pending queued frames to prevent stale tracking
                        while not input_queue.empty():
                            try:
                                _ = input_queue.get_nowait()
                                session.dropped_frames += 1
                                session.queue_replacements += 1
                                input_queue.task_done()
                            except asyncio.QueueEmpty:
                                break

                        session.reset_tracker()
                        await output_queue.put(
                            ("text", json.dumps({"type": "reset_tracker_ack", "status": "ok"}))
                        )

                    elif msg_type == "ping":
                        await output_queue.put(("text", json.dumps({"type": "pong"})))

                except Exception as e:
                    logger.warning("Error parsing text WebSocket message: %s", e)
                    await output_queue.put(
                        ("text", json.dumps({"type": "error", "message": f"Malformed message: {e}"}))
                    )

            # Handle binary video frame messages
            elif "bytes" in message:
                raw_bytes = message["bytes"]
                if not raw_bytes or len(raw_bytes) < 4:
                    continue

                # Validate binary frame size against configured limit
                max_frame_bytes = int(settings.max_ws_frame_size_mb * 1024 * 1024)
                if len(raw_bytes) > max_frame_bytes:
                    logger.warning(
                        "WebSocket frame rejected: size %d bytes exceeds max_ws_frame_size_mb (%d MB).",
                        len(raw_bytes),
                        settings.max_ws_frame_size_mb,
                    )
                    await output_queue.put(
                        (
                            "text",
                            json.dumps({
                                "type": "error",
                                "message": f"Frame size ({len(raw_bytes)} bytes) exceeds maximum limit of {settings.max_ws_frame_size_mb} MB.",
                            }),
                        )
                    )
                    continue

                # Determine if client included a 4-byte frame_id header
                if raw_bytes[0] == 0xFF and raw_bytes[1] == 0xD8:
                    auto_frame_id += 1
                    frame_id = auto_frame_id
                    frame_bytes = raw_bytes
                else:
                    frame_id = struct.unpack("!I", raw_bytes[:4])[0]
                    frame_bytes = raw_bytes[4:]

                # Validate JPEG signature of payload bytes
                if len(frame_bytes) < 3 or frame_bytes[0] != 0xFF or frame_bytes[1] != 0xD8:
                    logger.warning("WebSocket frame %d rejected: invalid JPEG magic bytes.", frame_id)
                    await output_queue.put(
                        (
                            "text",
                            json.dumps({
                                "type": "error",
                                "frame_id": frame_id,
                                "message": "Malformed binary frame: payload does not contain valid JPEG data.",
                            }),
                        )
                    )
                    continue

                receive_t = time.perf_counter()

                # Bounded Queue Replacement: If worker is busy, discard oldest pending frame
                if input_queue.full():
                    try:
                        _ = input_queue.get_nowait()
                        session.dropped_frames += 1
                        session.queue_replacements += 1
                        input_queue.task_done()
                    except asyncio.QueueEmpty:
                        pass

                input_queue.put_nowait((frame_id, frame_bytes, receive_t))

    async def _inference_worker() -> None:
        while True:
            frame_id, frame_bytes, receive_t = await input_queue.get()
            try:
                # Non-blocking threadpool execution for CPU/GPU-bound frame processing
                metadata, annotated_jpeg = await run_in_threadpool(
                    session.process_frame_bytes,
                    camera_service,
                    frame_bytes,
                    frame_id,
                    receive_t,
                )
                await output_queue.put(("frame", (metadata, annotated_jpeg, frame_id)))
            except Exception as e:
                logger.error("Error processing frame %s: %s", frame_id, e)
                err_payload = {
                    "type": "error",
                    "frame_id": frame_id,
                    "message": str(e),
                }
                await output_queue.put(("text", json.dumps(err_payload)))
            finally:
                input_queue.task_done()

    async def _write_loop() -> None:
        while True:
            msg_type, payload = await output_queue.get()
            try:
                if msg_type == "text":
                    await websocket.send_text(payload)
                elif msg_type == "frame":
                    metadata, annotated_jpeg, frame_id = payload
                    # 1. Send JSON telemetry
                    await websocket.send_text(json.dumps(metadata))
                    # 2. Send paired annotated binary frame if enabled
                    if annotated_jpeg is not None and session.config.return_annotated_frame:
                        header = struct.pack("!I", frame_id)
                        await websocket.send_bytes(header + annotated_jpeg)
            except Exception as e:
                logger.warning("Error writing to WebSocket on session %s: %s", session_id, e)
                break
            finally:
                output_queue.task_done()

    # Launch concurrent reader, worker, and writer tasks
    reader_task = asyncio.create_task(_read_loop(), name=f"ws-reader-{session_id}")
    worker_task = asyncio.create_task(_inference_worker(), name=f"ws-worker-{session_id}")
    writer_task = asyncio.create_task(_write_loop(), name=f"ws-writer-{session_id}")

    tasks = [reader_task, worker_task, writer_task]

    try:
        # Await any task exit (e.g. reader catches disconnect or writer fails)
        done, pending = await asyncio.wait(tasks, return_when=asyncio.FIRST_COMPLETED)
        for task in done:
            if not task.cancelled() and task.exception():
                exc = task.exception()
                if not isinstance(exc, WebSocketDisconnect):
                    logger.error("Streaming task failed with exception: %s", exc)

    except WebSocketDisconnect:
        logger.info("WebSocket disconnected. Session: %s", session_id)
    except Exception as e:
        logger.error("Unexpected WebSocket error on session %s: %s", session_id, e)
    finally:
        for task in tasks:
            if not task.done():
                task.cancel()
        session.reset_tracker()
        stream_manager.remove_session(session_id)
        logger.info("Cleaned up streaming session %s", session_id)

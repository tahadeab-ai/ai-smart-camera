"""WebSocket endpoint handling real-time camera streaming with binary JPEG & JSON metadata."""

import json
import logging
import struct
import uuid

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
        return True

    origin = websocket.headers.get("origin")
    if not origin:
        # Direct non-browser clients (or same-origin where Origin header is omitted)
        return True

    # Check origin or stripped protocol
    cleaned_origins = {o.rstrip("/") for o in settings.cors_origins}
    return origin.rstrip("/") in cleaned_origins


@router.websocket("/stream")
async def websocket_camera_stream(
    websocket: WebSocket,
) -> None:
    """Real-time bi-directional camera streaming endpoint with ticket authentication and origin validation.

    Protocol:
      1. Origin Check: Validates WebSocket Origin against settings.cors_origins.
      2. Authentication: Validates single-use ?ticket= query param via ticket_manager if access_token is configured.
      3. Concurrency: Atomically reserves a session slot before accepting handshake.
      4. Config (Text JSON): {"type": "config", "confidence_threshold": 0.25, ...}
      5. Frames (Binary): [4-byte uint32 frame_id] + [JPEG bytes] or raw JPEG bytes.
      6. Responses:
         - Text JSON metadata: {"type": "detection", "frame_id": ..., "fps": ..., "latency_ms": ...}
         - Binary annotated JPEG: [4-byte uint32 frame_id] + [JPEG bytes].
    """
    # 1. Validate Origin header
    if not _is_origin_allowed(websocket):
        logger.warning(
            "WebSocket rejected: Origin '%s' not permitted in cors_origins.",
            websocket.headers.get("origin"),
        )
        await websocket.close(code=status.WS_1008_POLICY_VIOLATION)
        return

    # 2. Validate single-use ticket if access token is required
    if settings.access_token:
        ticket = websocket.query_params.get("ticket")
        # Backwards compatibility check for query token (deprecated) or ticket
        is_valid = ticket_manager.consume_ticket(ticket or "")
        if not is_valid:
            # Fallback check if user passed master token directly in development/test
            master_token = websocket.query_params.get("token") or websocket.headers.get("x-access-token")
            if master_token != settings.access_token:
                logger.warning("WebSocket rejected: invalid or missing single-use ticket.")
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
    auto_frame_id = 0

    logger.info("WebSocket connected. Session: %s", session_id)

    try:
        while True:
            message = await websocket.receive()

            # Handle text messages (configuration updates or ping)
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
                        )
                        await websocket.send_text(
                            json.dumps({"type": "config_ack", "status": "ok"})
                        )
                    elif msg_type == "ping":
                        await websocket.send_text(json.dumps({"type": "pong"}))
                except Exception as e:
                    logger.warning("Error parsing text WebSocket message: %s", e)
                    await websocket.send_text(
                        json.dumps({"type": "error", "message": f"Malformed message: {e}"})
                    )

            # Handle binary video frame messages
            elif "bytes" in message:
                raw_bytes = message["bytes"]
                if not raw_bytes or len(raw_bytes) < 4:
                    continue

                # Determine if client included a 4-byte frame_id header
                # Standard JPEG starts with 0xFF 0xD8
                if raw_bytes[0] == 0xFF and raw_bytes[1] == 0xD8:
                    auto_frame_id += 1
                    frame_id = auto_frame_id
                    frame_bytes = raw_bytes
                else:
                    # Unpack 4-byte big-endian frame_id
                    frame_id = struct.unpack("!I", raw_bytes[:4])[0]
                    frame_bytes = raw_bytes[4:]

                try:
                    # Non-blocking threadpool execution for CPU/GPU-bound frame processing
                    metadata, annotated_jpeg = await run_in_threadpool(
                        session.process_frame_bytes,
                        camera_service,
                        frame_bytes,
                        frame_id,
                    )

                    # Send JSON telemetry
                    await websocket.send_text(json.dumps(metadata))

                    # Send paired annotated binary frame if enabled
                    if annotated_jpeg is not None and session.config.return_annotated_frame:
                        header = struct.pack("!I", frame_id)
                        await websocket.send_bytes(header + annotated_jpeg)

                except Exception as e:
                    logger.error("Error processing frame %s: %s", frame_id, e)
                    err_payload = {
                        "type": "error",
                        "frame_id": frame_id,
                        "message": str(e),
                    }
                    await websocket.send_text(json.dumps(err_payload))

    except WebSocketDisconnect:
        logger.info("WebSocket disconnected. Session: %s", session_id)
    except Exception as e:
        logger.error("Unexpected WebSocket error on session %s: %s", session_id, e)
    finally:
        stream_manager.remove_session(session_id)

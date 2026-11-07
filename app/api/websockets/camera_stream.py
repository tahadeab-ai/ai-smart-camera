"""WebSocket endpoint handling real-time camera streaming with binary JPEG & JSON metadata."""

import json
import logging
import struct
import uuid

from fastapi import APIRouter, WebSocket, WebSocketDisconnect, status

from app.api.dependencies import get_camera_service
from app.config import settings
from app.services.stream_manager import stream_manager

logger = logging.getLogger(__name__)
router = APIRouter(tags=["Stream"])


@router.websocket("/stream")
async def websocket_camera_stream(
    websocket: WebSocket,
) -> None:
    """Real-time bi-directional camera streaming endpoint.

    Protocol:
      1. Authentication: optional query parameter '?token=...' or header 'X-Access-Token'.
      2. Config (Text JSON): {"type": "config", "confidence_threshold": 0.25, ...}
      3. Frames (Binary): JPEG bytes or [4-byte uint32 frame_id] + [JPEG bytes].
      4. Responses:
         - Text JSON metadata: {"type": "detection", "frame_id": ..., "fps": ..., ...}
         - Binary annotated JPEG: [4-byte uint32 frame_id] + [JPEG bytes] (if return_annotated_frame=True).
    """
    # 1. Token validation if configured
    if settings.access_token:
        token = websocket.query_params.get("token") or websocket.headers.get("x-access-token")
        if token != settings.access_token:
            logger.warning("WebSocket handshake rejected: invalid access token.")
            await websocket.close(code=status.WS_1008_POLICY_VIOLATION)
            return

    # 2. Concurrency limit check
    if stream_manager.active_count >= settings.max_concurrent_streams:
        logger.warning(
            "WebSocket rejected: max concurrent streams (%d) reached.",
            settings.max_concurrent_streams,
        )
        await websocket.close(code=status.WS_1013_TRY_AGAIN_LATER)
        return

    await websocket.accept()

    session_id = str(uuid.uuid4())
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
                    metadata, annotated_jpeg = session.process_frame_bytes(
                        camera_service=camera_service,
                        frame_bytes=frame_bytes,
                        frame_id=frame_id,
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

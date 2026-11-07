"""Unit tests for WebSocket camera streaming protocol."""

import io
import json
import struct
from unittest.mock import MagicMock, patch

import numpy as np
import pytest
from fastapi.testclient import TestClient
from PIL import Image
from starlette.websockets import WebSocketDisconnect

from app.api.app import app
from app.api.dependencies import set_camera_service
from app.config import settings
from app.services.camera_service import CameraService


@pytest.fixture
def mock_ws_service():
    """Provides a mocked CameraService for WebSocket testing."""
    with patch("app.services.camera_service.ModelLoader"), \
         patch("app.services.camera_service.InferenceEngine"):
        service = MagicMock(spec=CameraService)
        service.model_name = "yolov8n"
        service.device = "cpu"
        service.model = MagicMock()
        service.detector = MagicMock()
        service.detector.class_names = {0: "person"}
        service.annotator = MagicMock()
        service.counter = MagicMock()
        service._lock = MagicMock()
        service._lock.__enter__ = MagicMock()
        service._lock.__exit__ = MagicMock()

        # Mock inference predict on inference_engine
        mock_engine = MagicMock()
        mock_results = MagicMock()
        mock_engine.predict.return_value = ([mock_results], 10.0)
        service.inference_engine = mock_engine

        # Mock detector process_results
        mock_detections = MagicMock()
        mock_detections.__len__ = MagicMock(return_value=1)
        mock_detections.xyxy = np.array([[10, 20, 100, 200]], dtype=np.float32)
        mock_detections.confidence = np.array([0.95], dtype=np.float32)
        mock_detections.class_id = np.array([0], dtype=np.int32)
        service.detector.process_results.return_value = mock_detections

        # Mock annotator
        dummy_rgb = np.zeros((240, 320, 3), dtype=np.uint8)
        service.annotator.annotate.return_value = dummy_rgb

        # Mock counter
        service.counter.count.return_value = {
            "total_count": 1,
            "class_counts": {"person": 1},
        }

        # Mock _extract_boxes
        service._extract_boxes.return_value = [
            {
                "x1": 10.0,
                "y1": 20.0,
                "x2": 100.0,
                "y2": 200.0,
                "confidence": 0.95,
                "class_id": 0,
                "class_name": "person",
            }
        ]

        set_camera_service(service)
        return service


def create_test_jpeg_bytes() -> bytes:
    """Generates valid minimal JPEG bytes."""
    img = Image.new("RGB", (160, 120), color="green")
    buf = io.BytesIO()
    img.save(buf, format="JPEG")
    return buf.getvalue()


def test_websocket_stream_flow(mock_ws_service):
    """Tests the full WebSocket streaming protocol."""
    client = TestClient(app)

    with client.websocket_connect("/api/v1/stream") as ws:
        # 1. Send client config
        config_payload = {
            "type": "config",
            "confidence_threshold": 0.4,
            "return_annotated_frame": True,
            "skip_interval": 1,
        }
        ws.send_text(json.dumps(config_payload))
        ack_text = ws.receive_text()
        ack = json.loads(ack_text)
        assert ack["type"] == "config_ack"
        assert ack["status"] == "ok"

        # 2. Send binary JPEG frame with 4-byte frame_id (e.g. frame_id = 101)
        jpeg_bytes = create_test_jpeg_bytes()
        frame_id = 101
        header = struct.pack("!I", frame_id)
        ws.send_bytes(header + jpeg_bytes)

        # 3. Receive JSON metadata
        meta_text = ws.receive_text()
        meta = json.loads(meta_text)
        assert meta["type"] == "detection"
        assert meta["frame_id"] == frame_id
        assert meta["stats"]["total_count"] == 1
        assert meta["stats"]["class_counts"]["person"] == 1
        assert meta["skipped"] is False

        # 4. Receive paired annotated binary frame
        binary_resp = ws.receive_bytes()
        resp_frame_id = struct.unpack("!I", binary_resp[:4])[0]
        assert resp_frame_id == frame_id
        resp_jpeg = binary_resp[4:]
        # Verify starts with JPEG SOI marker 0xFF 0xD8
        assert resp_jpeg[:2] == b"\xff\xd8"


def test_websocket_auth_rejection(mock_ws_service, monkeypatch):
    """Tests that WebSocket disconnects with policy violation when token is invalid."""
    monkeypatch.setattr(settings, "access_token", "secure-stream-key")
    client = TestClient(app)

    # Handshake with invalid token
    with pytest.raises(WebSocketDisconnect) as excinfo:
        with client.websocket_connect("/api/v1/stream?token=wrong-key"):
            pass
    assert excinfo.value.code == 1008

    # Handshake with valid token
    with client.websocket_connect("/api/v1/stream?token=secure-stream-key") as ws:
        ws.send_text(json.dumps({"type": "ping"}))
        pong = json.loads(ws.receive_text())
        assert pong["type"] == "pong"

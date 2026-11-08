"""Unit tests for WebSocket camera streaming protocol with authentication, origin validation, and concurrency."""

import io
import json
import struct
import time
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
from app.services.stream_manager import stream_manager
from app.services.ticket_manager import ticket_manager

VALID_ORIGIN = "http://localhost:7860"


@pytest.fixture(autouse=True)
def reset_state():
    """Resets stream sessions and tickets between tests."""
    ticket_manager.clear()
    with stream_manager._lock:
        stream_manager._sessions.clear()
        stream_manager._reserved_slots.clear()


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
        mock_detections = sv.Detections(
            xyxy=np.array([[10, 20, 100, 200]], dtype=np.float32),
            confidence=np.array([0.95], dtype=np.float32),
            class_id=np.array([0], dtype=np.int32),
        )
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
    """Tests the full WebSocket streaming protocol with decomposed metrics."""
    client = TestClient(app)

    with client.websocket_connect(
        "/api/v1/stream", headers={"Origin": VALID_ORIGIN}
    ) as ws:
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

        # 2. Send binary JPEG frame with 4-byte frame_id
        jpeg_bytes = create_test_jpeg_bytes()
        frame_id = 101
        header = struct.pack("!I", frame_id)
        ws.send_bytes(header + jpeg_bytes)

        # 3. Receive JSON metadata and verify timing decomposition
        meta_text = ws.receive_text()
        meta = json.loads(meta_text)
        assert meta["type"] == "detection"
        assert meta["frame_id"] == frame_id
        assert meta["stats"]["total_count"] == 1
        assert meta["stats"]["class_counts"]["person"] == 1
        assert meta["frame_skipped"] is False
        assert "model_inference_ms" in meta
        assert "annotation_ms" in meta
        assert "frame_processing_ms" in meta

        # 4. Receive paired annotated binary frame
        binary_resp = ws.receive_bytes()
        resp_frame_id = struct.unpack("!I", binary_resp[:4])[0]
        assert resp_frame_id == frame_id
        resp_jpeg = binary_resp[4:]
        assert resp_jpeg[:2] == b"\xff\xd8"


def test_websocket_ticket_single_use(mock_ws_service, monkeypatch):
    """Tests that a single-use ticket can connect once and cannot be reused."""
    monkeypatch.setattr(settings, "access_token", "master-secret")
    client = TestClient(app)

    ticket = ticket_manager.create_ticket(client_id="test-client")

    # First connection with ticket succeeds
    with client.websocket_connect(
        f"/api/v1/stream?ticket={ticket}", headers={"Origin": VALID_ORIGIN}
    ) as ws:
        ws.send_text(json.dumps({"type": "ping"}))
        pong = json.loads(ws.receive_text())
        assert pong["type"] == "pong"

    # Second connection reusing the same ticket must be rejected with 1008
    with pytest.raises(WebSocketDisconnect) as excinfo:
        with client.websocket_connect(
            f"/api/v1/stream?ticket={ticket}", headers={"Origin": VALID_ORIGIN}
        ):
            pass
    assert excinfo.value.code == 1008


def test_websocket_rejects_permanent_token(mock_ws_service, monkeypatch):
    """Tests that passing permanent master token directly in query string is strictly rejected."""
    monkeypatch.setattr(settings, "access_token", "master-secret")
    client = TestClient(app)

    # Attempt connecting with permanent token instead of ticket
    with pytest.raises(WebSocketDisconnect) as excinfo:
        with client.websocket_connect(
            "/api/v1/stream?token=master-secret", headers={"Origin": VALID_ORIGIN}
        ):
            pass
    assert excinfo.value.code == 1008


def test_websocket_rejects_invalid_ticket(mock_ws_service, monkeypatch):
    """Tests that an invalid or fabricated ticket is rejected with 1008."""
    monkeypatch.setattr(settings, "access_token", "master-secret")
    client = TestClient(app)

    with pytest.raises(WebSocketDisconnect) as excinfo:
        with client.websocket_connect(
            "/api/v1/stream?ticket=invalid-bogus-ticket", headers={"Origin": VALID_ORIGIN}
        ):
            pass
    assert excinfo.value.code == 1008


def test_websocket_expired_ticket_rejection(mock_ws_service, monkeypatch):
    """Tests that an expired ticket is rejected."""
    monkeypatch.setattr(settings, "access_token", "master-secret")
    client = TestClient(app)

    # Issue ticket and artificially expire it
    ticket = ticket_manager.create_ticket(client_id="test-client")
    with ticket_manager._lock:
        ticket_manager._tickets[ticket].expires_at = time.time() - 10.0

    with pytest.raises(WebSocketDisconnect) as excinfo:
        with client.websocket_connect(
            f"/api/v1/stream?ticket={ticket}", headers={"Origin": VALID_ORIGIN}
        ):
            pass
    assert excinfo.value.code == 1008


def test_websocket_origin_validation(mock_ws_service, monkeypatch):
    """Tests that origins not in cors_origins are rejected with 1008."""
    monkeypatch.setattr(settings, "cors_origins", ["https://trusted-domain.com"])
    client = TestClient(app)

    # Disallowed origin
    with pytest.raises(WebSocketDisconnect) as excinfo:
        with client.websocket_connect(
            "/api/v1/stream", headers={"Origin": "https://malicious-site.com"}
        ):
            pass
    assert excinfo.value.code == 1008

    # Allowed origin
    with client.websocket_connect(
        "/api/v1/stream", headers={"Origin": "https://trusted-domain.com"}
    ) as ws:
        ws.send_text(json.dumps({"type": "ping"}))
        pong = json.loads(ws.receive_text())
        assert pong["type"] == "pong"


def test_websocket_rejects_missing_origin_by_default(mock_ws_service, monkeypatch):
    """Tests that connections without Origin header are rejected when allow_originless_ws=False."""
    monkeypatch.setattr(settings, "allow_originless_ws", False)
    client = TestClient(app)

    with pytest.raises(WebSocketDisconnect) as excinfo:
        with client.websocket_connect("/api/v1/stream"):
            pass
    assert excinfo.value.code == 1008


def test_websocket_rejects_wildcard_in_authenticated_deployment(mock_ws_service, monkeypatch):
    """Tests that wildcard '*' origin is rejected if access_token is set."""
    monkeypatch.setattr(settings, "access_token", "secret123")
    monkeypatch.setattr(settings, "cors_origins", ["*"])
    client = TestClient(app)

    ticket = ticket_manager.create_ticket(client_id="test")

    with pytest.raises(WebSocketDisconnect) as excinfo:
        with client.websocket_connect(
            f"/api/v1/stream?ticket={ticket}", headers={"Origin": "http://anything.com"}
        ):
            pass
    assert excinfo.value.code == 1008


def test_websocket_frame_size_limit(mock_ws_service, monkeypatch):
    """Tests that binary frames exceeding max_ws_frame_size_mb return an error."""
    # Set limit to 0.001 MB (~1KB)
    monkeypatch.setattr(settings, "max_ws_frame_size_mb", 0.001)
    client = TestClient(app)

    with client.websocket_connect(
        "/api/v1/stream", headers={"Origin": VALID_ORIGIN}
    ) as ws:
        oversized_bytes = b"\xff\xd8" + b"A" * 2000
        ws.send_bytes(oversized_bytes)
        resp_text = ws.receive_text()
        resp = json.loads(resp_text)
        assert resp["type"] == "error"
        assert "exceeds" in resp["message"]


def test_websocket_rejects_non_jpeg_frame(mock_ws_service):
    """Tests that binary frames with invalid JPEG signatures are rejected."""
    client = TestClient(app)

    with client.websocket_connect(
        "/api/v1/stream", headers={"Origin": VALID_ORIGIN}
    ) as ws:
        invalid_bytes = struct.pack("!I", 1) + b"GIF89aNOTAJPEG"
        ws.send_bytes(invalid_bytes)
        resp_text = ws.receive_text()
        resp = json.loads(resp_text)
        assert resp["type"] == "error"
        assert "JPEG" in resp["message"]


def test_websocket_concurrency_limit_exceeded(mock_ws_service, monkeypatch):
    """Tests that exceeding max_concurrent_streams rejects incoming connection with 1013."""
    monkeypatch.setattr(settings, "max_concurrent_streams", 1)
    monkeypatch.setattr(stream_manager, "max_concurrent", 1)
    client = TestClient(app)

    with client.websocket_connect(
        "/api/v1/stream", headers={"Origin": VALID_ORIGIN}
    ):
        # Second simultaneous connection exceeds limit of 1
        with pytest.raises(WebSocketDisconnect) as excinfo:
            with client.websocket_connect(
                "/api/v1/stream", headers={"Origin": VALID_ORIGIN}
            ):
                pass
        assert excinfo.value.code == 1013

"""Unit and integration tests for FastAPI REST endpoints."""

import io
from unittest.mock import MagicMock, patch

import numpy as np
import pytest
from fastapi.testclient import TestClient
from PIL import Image

from app.api.app import app
from app.api.dependencies import set_camera_service
from app.config import settings
from app.services.camera_service import CameraService
from app.services.rate_limiter import image_rate_limiter, ticket_rate_limiter
from app.services.ticket_manager import ticket_manager


@pytest.fixture(autouse=True)
def reset_limiters():
    """Resets in-memory rate limiters and tickets before each test."""
    image_rate_limiter.reset()
    ticket_rate_limiter.reset()
    ticket_manager.clear()


@pytest.fixture
def mock_service():
    """Provides a mocked CameraService for FastAPI route tests."""
    with patch("app.services.camera_service.ModelLoader"), \
         patch("app.services.camera_service.InferenceEngine"):
        service = MagicMock(spec=CameraService)
        service.model_name = "yolov8n"
        service.device = "cpu"
        service.model = MagicMock()
        service.detector = MagicMock()
        service.detector.class_names = {0: "person", 1: "bicycle"}

        # Mock process_image_detailed
        dummy_rgb = np.zeros((480, 640, 3), dtype=np.uint8)
        dummy_boxes = [
            {
                "x1": 50.0,
                "y1": 50.0,
                "x2": 200.0,
                "y2": 300.0,
                "confidence": 0.92,
                "class_id": 0,
                "class_name": "person",
            }
        ]
        dummy_stats = {"total_count": 1, "class_counts": {"person": 1}}
        service.process_image_detailed.return_value = (
            dummy_rgb,
            dummy_rgb,
            dummy_boxes,
            dummy_stats,
            15.4,
        )

        service.switch_model.return_value = {
            "status": "success",
            "model_name": "yolo11n",
            "device": "cpu",
            "classes_count": 80,
        }

        set_camera_service(service)
        return service


@pytest.fixture
def client(mock_service):
    """Provides FastAPI TestClient."""
    return TestClient(app)


def test_health_live(client):
    """GET /api/v1/health/live returns 200 and version 0.2.1."""
    response = client.get("/api/v1/health/live")
    assert response.status_code == 200
    data = response.json()
    assert data["status"] == "ok"
    assert data["version"] == "0.2.1"
    assert "timestamp" in data


def test_health_ready(client, mock_service):
    """GET /api/v1/health/ready returns 200 when service is set."""
    response = client.get("/api/v1/health/ready")
    assert response.status_code == 200
    assert response.json()["status"] == "ready"


def test_system_info(client, mock_service):
    """GET /api/v1/system/info returns telemetry."""
    response = client.get("/api/v1/system/info")
    assert response.status_code == 200
    data = response.json()
    assert data["active_model"] == "yolov8n"
    assert data["device"] == "cpu"
    assert "platform" in data
    assert "python_version" in data


def test_list_models(client, mock_service):
    """GET /api/v1/models returns available models."""
    response = client.get("/api/v1/models")
    assert response.status_code == 200
    data = response.json()
    assert "models" in data
    assert len(data["models"]) >= 1
    assert data["active_model"] == "yolov8n"


def test_switch_model_endpoint(client, mock_service):
    """POST /api/v1/models/switch switches active model."""
    response = client.post(
        "/api/v1/models/switch",
        json={"model_name": "yolo11n", "device": "cpu"},
    )
    assert response.status_code == 200
    data = response.json()
    assert data["status"] == "success"
    assert data["active_model"] == "yolo11n"


def test_detect_image_endpoint(client, mock_service):
    """POST /api/v1/detect/image processes uploaded image and returns schema."""
    img = Image.new("RGB", (320, 240), color="blue")
    buf = io.BytesIO()
    img.save(buf, format="JPEG")
    buf.seek(0)

    response = client.post(
        "/api/v1/detect/image",
        files={"file": ("test.jpg", buf, "image/jpeg")},
        data={"confidence": "0.3", "iou_threshold": "0.5"},
    )

    assert response.status_code == 200
    data = response.json()
    assert "annotated_image" in data
    assert data["annotated_image"].startswith("data:image/jpeg;base64,")
    assert data["stats"]["total_count"] == 1
    assert len(data["detections"]) == 1
    assert data["detections"][0]["class_name"] == "person"
    assert data["latency_ms"] == 15.4


def test_detect_image_invalid_magic_bytes(client, mock_service):
    """POST /api/v1/detect/image with corrupt image header returns 400 INVALID_IMAGE_FORMAT."""
    response = client.post(
        "/api/v1/detect/image",
        files={"file": ("corrupt.txt", b"not an image with valid magic bytes", "text/plain")},
    )
    assert response.status_code == 400
    assert response.json()["error"]["code"] == "INVALID_IMAGE_FORMAT"


def test_detect_image_dimensions_too_small(client, mock_service):
    """POST /api/v1/detect/image with dimensions < 10x10 returns 400 INVALID_IMAGE_DIMENSIONS."""
    img = Image.new("RGB", (8, 8), color="red")
    buf = io.BytesIO()
    img.save(buf, format="JPEG")
    buf.seek(0)

    response = client.post(
        "/api/v1/detect/image",
        files={"file": ("tiny.jpg", buf, "image/jpeg")},
    )
    assert response.status_code == 400
    assert response.json()["error"]["code"] == "INVALID_IMAGE_DIMENSIONS"


def test_detect_image_payload_too_large(client, mock_service, monkeypatch):
    """POST /api/v1/detect/image exceeding size limit returns 413."""
    # Temporarily set max upload to 1MB
    monkeypatch.setattr(settings, "max_upload_size_mb", 1)
    large_payload = b"\xff\xd8\xff" + b"0" * (1024 * 1024 + 10)

    response = client.post(
        "/api/v1/detect/image",
        files={"file": ("oversized.jpg", large_payload, "image/jpeg")},
    )
    assert response.status_code == 413
    assert response.json()["error"]["code"] == "PAYLOAD_TOO_LARGE"


def test_rate_limiting_detect_image(client, mock_service):
    """POST /api/v1/detect/image enforces 10 req/min sliding window rate limit."""
    img = Image.new("RGB", (100, 100), color="green")
    buf = io.BytesIO()
    img.save(buf, format="JPEG")
    img_bytes = buf.getvalue()

    for i in range(10):
        res = client.post(
            "/api/v1/detect/image",
            files={"file": (f"test_{i}.jpg", io.BytesIO(img_bytes), "image/jpeg")},
        )
        assert res.status_code == 200

    # 11th request must be rejected with 429
    res_11 = client.post(
        "/api/v1/detect/image",
        files={"file": ("test_11.jpg", io.BytesIO(img_bytes), "image/jpeg")},
    )
    assert res_11.status_code == 429
    assert res_11.json()["error"]["code"] == "RATE_LIMIT_EXCEEDED"
    assert "Retry-After" in res_11.headers


def test_ws_ticket_issuance(client, mock_service, monkeypatch):
    """POST /api/v1/auth/ws-ticket issues single-use token when authenticated."""
    monkeypatch.setattr(settings, "access_token", "test-token-123")

    # Unauthorized request
    res_unauth = client.post("/api/v1/auth/ws-ticket")
    assert res_unauth.status_code == 401

    # Authorized request
    res_auth = client.post(
        "/api/v1/auth/ws-ticket",
        headers={"X-Access-Token": "test-token-123"},
    )
    assert res_auth.status_code == 200
    data = res_auth.json()
    assert "ticket" in data
    assert len(data["ticket"]) >= 32
    assert data["expires_in"] == 30

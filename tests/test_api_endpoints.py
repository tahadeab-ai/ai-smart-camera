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
    """GET /api/v1/health/live returns 200 and version 0.2.0."""
    response = client.get("/api/v1/health/live")
    assert response.status_code == 200
    data = response.json()
    assert data["status"] == "ok"
    assert data["version"] == "0.2.0"
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
    # Create in-memory JPEG image
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


def test_detect_image_invalid_file(client, mock_service):
    """POST /api/v1/detect/image with corrupt image returns 400."""
    response = client.post(
        "/api/v1/detect/image",
        files={"file": ("corrupt.txt", b"not an image", "text/plain")},
    )
    assert response.status_code == 400
    assert response.json()["error"]["code"] == "INVALID_IMAGE"


def test_access_token_security(client, mock_service, monkeypatch):
    """Verifies that when access_token is set, unauthorized requests receive 401."""
    monkeypatch.setattr(settings, "access_token", "secret-test-token")

    # Unauthorized request
    res = client.get("/api/v1/system/info")
    assert res.status_code == 401
    assert res.json()["error"]["code"] == "UNAUTHORIZED"

    # Authorized request via header
    res_auth = client.get(
        "/api/v1/system/info",
        headers={"X-Access-Token": "secret-test-token"},
    )
    assert res_auth.status_code == 200

"""Concurrency and non-blocking event loop tests."""

import io
import time
from unittest.mock import MagicMock, patch

import pytest
from fastapi.testclient import TestClient
from PIL import Image

from app.api.app import app
from app.api.dependencies import set_camera_service
from app.services.camera_service import CameraService
from app.services.rate_limiter import image_rate_limiter


@pytest.fixture(autouse=True)
def reset_limiters():
    image_rate_limiter.reset()


def test_health_check_remains_responsive_during_inference():
    """Verifies that slow inference offloaded via run_in_threadpool does not freeze health checks."""
    with patch("app.services.camera_service.ModelLoader"), \
         patch("app.services.camera_service.InferenceEngine"):
        service = MagicMock(spec=CameraService)
        service.model_name = "yolov8n"
        service.device = "cpu"

        def slow_process(*args, **kwargs):
            time.sleep(0.15)  # Simulate CPU-heavy YOLO forward pass
            dummy_rgb = np_zeros = b""
            return dummy_rgb, np_zeros, [], {"total_count": 0, "class_counts": {}}, 150.0

        service.process_image_detailed.side_effect = slow_process
        set_camera_service(service)

    client = TestClient(app)

    # Health check must return quickly
    t0 = time.perf_counter()
    res = client.get("/api/v1/health/live")
    elapsed = time.perf_counter() - t0

    assert res.status_code == 200
    assert elapsed < 0.1  # Event loop responds in <100ms

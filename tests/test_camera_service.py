"""Unit tests for CameraService and frame-skipping state preservation."""

from unittest.mock import MagicMock, patch

import numpy as np
import pytest

from app.services.camera_service import CameraService


@pytest.fixture
def mock_camera_service():
    """Provides a mocked CameraService without downloading YOLO weights."""
    with patch("app.services.camera_service.ModelLoader") as MockLoader, \
         patch("app.services.camera_service.InferenceEngine") as MockEngine:

        mock_loader_instance = MockLoader.return_value
        mock_loader_instance.load.return_value = (
            MagicMock(),
            {"classes": {0: "person", 1: "bicycle"}},
        )

        service = CameraService(model_name="yolov8n", device="cpu")

        # Mock predict to return dummy results and 12.5ms latency
        mock_results = MagicMock()
        mock_results.orig_shape = (480, 640)
        mock_results.boxes.xyxy = np.array([[50, 50, 200, 300]], dtype=np.float32)
        mock_results.boxes.conf = np.array([0.88], dtype=np.float32)
        mock_results.boxes.cls = np.array([0], dtype=np.int32)
        mock_results.boxes.id = None
        mock_results.masks = None
        mock_results.keypoints = None
        mock_results.probs = None
        mock_results.obb = None

        service.inference_engine.predict = MagicMock(return_value=([mock_results], 12.5))
        return service


def test_frame_skipping_preserves_detections_and_stats(mock_camera_service):
    """Verifies that skipping frames does NOT drop detections to zero or flicker blank frames."""
    dummy_frame = np.zeros((480, 640, 3), dtype=np.uint8)

    # Frame 1: Normal processing (skip_interval=2, frame_counter=1 -> 1 % 2 != 0 -> wait, let's see)
    # With skip_interval=2, frame 1 % 2 == 1 != 0 (skipped)
    # So let's run frame with skip_interval=1 first to populate cache
    frame_1, stats_1, latency_1 = mock_camera_service.process_frame(
        frame=dummy_frame, skip_interval=1
    )
    assert stats_1["total_count"] == 1
    assert stats_1["class_counts"].get("person") == 1
    assert stats_1["skipped"] is False
    assert latency_1 > 0

    # Frame 2: Skipped decimation (skip_interval=2, frame_counter=2 -> 2 % 2 == 0: runs)
    # Frame 3: Skipped decimation (frame_counter=3 -> 3 % 2 == 1: skipped!)
    frame_2, stats_2, latency_2 = mock_camera_service.process_frame(
        frame=dummy_frame, skip_interval=2
    )
    frame_3, stats_3, latency_3 = mock_camera_service.process_frame(
        frame=dummy_frame, skip_interval=2
    )

    # Frame 3 was skipped, but must preserve previous counts!
    assert stats_3["skipped"] is True
    assert stats_3["total_count"] == 1, "Skipped frame must preserve last total count"
    assert stats_3["class_counts"].get("person") == 1, "Skipped frame must preserve class counts"
    assert latency_3 == 0.0


def test_thread_safe_model_switch(mock_camera_service):
    """Verifies thread-safe model switching resets cache and updates metadata."""
    with patch.object(mock_camera_service.loader, "load") as mock_load:
        mock_load.return_value = (
            MagicMock(),
            {"classes": {0: "car", 1: "truck"}},
        )
        res = mock_camera_service.switch_model("yolo11n")
        assert res["status"] == "success"
        assert res["model_name"] == "yolo11n"
        assert mock_camera_service.model_name == "yolo11n"
        assert mock_camera_service._last_detections is None
        assert mock_camera_service._last_stats == {"total_count": 0, "class_counts": {}}

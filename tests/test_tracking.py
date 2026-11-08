"""Comprehensive tests for multi-object tracking isolation, ByteTrack integration, and trace lifecycle."""

import io
import json
import threading
from unittest.mock import MagicMock, patch

import numpy as np
import pytest
import supervision as sv
from fastapi.testclient import TestClient
from PIL import Image

from app.api.app import app
from app.api.dependencies import set_camera_service
from app.services.camera_service import CameraService
from app.services.stream_manager import StreamConfig, StreamSession
from app.services.ticket_manager import ticket_manager


def _create_jpeg_bytes(width: int = 640, height: int = 480) -> bytes:
    """Helper to create dummy valid JPEG bytes."""
    img_arr = np.zeros((height, width, 3), dtype=np.uint8)
    img = Image.fromarray(img_arr)
    buf = io.BytesIO()
    img.save(buf, format="JPEG")
    return buf.getvalue()


@pytest.fixture
def mock_tracking_service():
    """Provides a mocked CameraService for tracking tests."""
    with patch("app.services.camera_service.ModelLoader"), \
         patch("app.services.camera_service.InferenceEngine"):
        service = MagicMock(spec=CameraService)
        service.model_name = "yolov8n"
        service.device = "cpu"
        service.model = MagicMock()
        service.detector = MagicMock()
        service.detector.class_names = {0: "person", 1: "bicycle"}
        service.annotator = MagicMock()
        service.annotator.annotate.side_effect = lambda scene, detections, **kwargs: scene
        service.counter = MagicMock()
        service._lock = threading.Lock()

        # Default inference predict
        mock_engine = MagicMock()
        mock_results = MagicMock()
        mock_engine.predict.return_value = ([mock_results], 10.0)
        service.inference_engine = mock_engine

        # Default process_results returns empty
        service.detector.process_results.return_value = sv.Detections.empty()

        # Counter count mock
        def _count(detections=None, *args, **kwargs):
            total = len(detections) if detections is not None else 0
            return {"total_count": total, "class_counts": {"person": total}}
        service.counter.count.side_effect = _count

        # _extract_boxes mock
        def _extract(detections=None, *args, **kwargs):
            if detections is None or len(detections) == 0:
                return []
            boxes = []
            for i in range(len(detections)):
                tid = (
                    int(detections.tracker_id[i])
                    if (hasattr(detections, "tracker_id") and detections.tracker_id is not None and len(detections.tracker_id) > i and detections.tracker_id[i] is not None)
                    else None
                )
                boxes.append({
                    "x1": float(detections.xyxy[i][0]),
                    "y1": float(detections.xyxy[i][1]),
                    "x2": float(detections.xyxy[i][2]),
                    "y2": float(detections.xyxy[i][3]),
                    "class_name": "person",
                    "confidence": float(detections.confidence[i]) if detections.confidence is not None else 1.0,
                    "tracker_id": tid,
                })
            return boxes
        service._extract_boxes.side_effect = _extract

        return service


@pytest.fixture
def client(mock_tracking_service):
    """Provides a TestClient initialized with the mocked tracking service."""
    set_camera_service(mock_tracking_service)
    with patch("app.api.app.CameraService", return_value=mock_tracking_service):
        yield TestClient(app)


def test_session_tracking_isolation():
    """Verify that two independent StreamSessions maintain isolated ByteTrack and TraceAnnotator instances."""
    session_a = StreamSession(session_id="session-a", config=StreamConfig())
    session_b = StreamSession(session_id="session-b", config=StreamConfig())

    # Ensure distinct objects
    assert session_a.tracker is not session_b.tracker
    assert session_a.trace_annotator is not session_b.trace_annotator

    # Feed detections to session_a
    detections_a = sv.Detections(
        xyxy=np.array([[10, 10, 50, 50], [60, 60, 100, 100]]),
        confidence=np.array([0.9, 0.85]),
        class_id=np.array([0, 0]),
    )
    tracked_a = session_a.tracker.update_with_detections(detections_a)
    assert len(tracked_a) > 0
    assert tracked_a.tracker_id is not None

    # session_b tracker must be untouched and empty
    assert len(session_b.tracker.tracked_tracks) == 0


def test_tracker_id_persistence_across_frames():
    """Verify that ByteTrack assigns persistent IDs to smooth movements across frames."""
    session = StreamSession(session_id="session-persist", config=StreamConfig())

    # Simulate a target moving slightly across 5 frames
    tracked_ids = []
    for step in range(5):
        # Slightly shifting bounding box
        x_offset = step * 2
        detections = sv.Detections(
            xyxy=np.array([[50 + x_offset, 50, 100 + x_offset, 100]], dtype=np.float32),
            confidence=np.array([0.95], dtype=np.float32),
            class_id=np.array([0]),
        )
        tracked = session.tracker.update_with_detections(detections)
        if len(tracked) > 0 and tracked.tracker_id is not None:
            tracked_ids.append(int(tracked.tracker_id[0]))

    # Must retain the exact same tracker ID across smooth frames
    assert len(tracked_ids) == 5
    assert len(set(tracked_ids)) == 1, f"Expected 1 persistent ID, got: {tracked_ids}"


def test_raw_vs_tracked_statistics_separation(mock_tracking_service):
    """Verify raw detection statistics are computed before tracking and tracked statistics after."""
    session = StreamSession(
        session_id="session-stats",
        config=StreamConfig(confidence_threshold=0.25, enable_tracking=True),
    )
    frame_bytes = _create_jpeg_bytes()

    mock_tracking_service.detector.process_results.return_value = sv.Detections(
        xyxy=np.array([[10, 10, 60, 60], [100, 100, 150, 150]], dtype=np.float32),
        confidence=np.array([0.9, 0.85], dtype=np.float32),
        class_id=np.array([0, 0], dtype=np.int32),
    )

    meta, _ = session.process_frame_bytes(mock_tracking_service, frame_bytes, frame_id=1)
    stats = meta["stats"]
    assert "total_count" in stats
    assert "class_counts" in stats
    assert "tracked_count" in stats
    assert "tracked_class_counts" in stats
    assert stats["total_count"] == 2
    assert stats["tracked_count"] == 2


def test_reset_tracker_clears_state_and_traces():
    """Verify reset_tracker() resets ByteTrack, clears trace points, and clears cached state."""
    session = StreamSession(session_id="session-reset", config=StreamConfig())

    detections = sv.Detections(
        xyxy=np.array([[20, 20, 80, 80]], dtype=np.float32),
        confidence=np.array([0.9], dtype=np.float32),
        class_id=np.array([0]),
    )
    tracked = session.tracker.update_with_detections(detections)
    assert len(tracked) > 0
    tid = int(tracked.tracker_id[0])

    # Annotate trace
    dummy_scene = np.zeros((100, 100, 3), dtype=np.uint8)
    session.trace_annotator.annotate(dummy_scene, tracked)
    assert len(session.trace_annotator.trace.get(tid)) > 0

    # Execute complete reset
    session.reset_tracker()

    assert session.last_detections is None
    assert session.last_boxes == []
    assert session.last_annotated_jpeg is None
    assert session.last_stats["total_count"] == 0
    assert session.last_stats["tracked_count"] == 0
    # Trace history must be completely empty
    assert len(session.trace_annotator.trace.get(tid)) == 0
    assert len(session.tracker.tracked_tracks) == 0


def test_frame_skipping_no_duplicate_trace_points(mock_tracking_service):
    """Regression test: verify skip_interval > 1 does NOT append duplicate trace points on skipped frames."""
    session = StreamSession(
        session_id="session-skip-trace",
        config=StreamConfig(skip_interval=2, enable_tracking=True, enable_trails=True),
    )
    frame_bytes = _create_jpeg_bytes()

    mock_tracking_service.detector.process_results.return_value = sv.Detections(
        xyxy=np.array([[30, 30, 90, 90]], dtype=np.float32),
        confidence=np.array([0.92], dtype=np.float32),
        class_id=np.array([0], dtype=np.int32),
    )

    # Frame 1: Full inference -> should update tracker & trace
    meta1, _ = session.process_frame_bytes(mock_tracking_service, frame_bytes, frame_id=1)
    assert meta1["skipped"] is False
    assert len(meta1["detections"]) == 1
    tid = meta1["detections"][0]["tracker_id"]
    assert tid is not None

    trace_points_f1 = len(session.trace_annotator.trace.get(tid))
    assert trace_points_f1 == 1

    # Frame 2: Skipped frame -> must NOT update trace points
    meta2, _ = session.process_frame_bytes(mock_tracking_service, frame_bytes, frame_id=2)
    assert meta2["skipped"] is True

    # Verify trace points remained strictly 1 (no duplicate point added)
    trace_points_f2 = len(session.trace_annotator.trace.get(tid))
    assert trace_points_f2 == 1, f"Expected 1 point, but duplicate was added: {trace_points_f2}"


def test_tracking_disabled_behavior(mock_tracking_service):
    """Verify that when enable_tracking=False, tracker_id is None and tracked_count=0."""
    session = StreamSession(
        session_id="session-no-track",
        config=StreamConfig(enable_tracking=False),
    )
    frame_bytes = _create_jpeg_bytes()

    mock_tracking_service.detector.process_results.return_value = sv.Detections(
        xyxy=np.array([[40, 40, 100, 100]], dtype=np.float32),
        confidence=np.array([0.88], dtype=np.float32),
        class_id=np.array([0], dtype=np.int32),
    )

    meta, _ = session.process_frame_bytes(mock_tracking_service, frame_bytes, frame_id=1)
    assert meta["stats"]["total_count"] == 1
    assert meta["stats"]["tracked_count"] == 0
    assert meta["detections"][0]["tracker_id"] is None


def test_empty_detection_frames_handling(mock_tracking_service):
    """Verify empty detection frames do not throw and maintain tracking stability."""
    session = StreamSession(session_id="session-empty", config=StreamConfig())
    frame_bytes = _create_jpeg_bytes()

    mock_tracking_service.detector.process_results.return_value = sv.Detections.empty()

    meta, _ = session.process_frame_bytes(mock_tracking_service, frame_bytes, frame_id=1)
    assert meta["stats"]["total_count"] == 0
    assert meta["stats"]["tracked_count"] == 0
    assert len(meta["detections"]) == 0


def test_websocket_reset_tracker_protocol(client):
    """Verify WebSocket protocol acknowledges reset_tracker message deterministically."""
    ticket = ticket_manager.create_ticket()
    with client.websocket_connect(
        f"/api/v1/stream?ticket={ticket}",
        headers={"Origin": "http://localhost:7860"},
    ) as ws:
        # Send reset_tracker message
        ws.send_text(json.dumps({"type": "reset_tracker"}))
        resp_raw = ws.receive_text()
        resp = json.loads(resp_raw)
        assert resp == {"type": "reset_tracker_ack", "status": "ok"}

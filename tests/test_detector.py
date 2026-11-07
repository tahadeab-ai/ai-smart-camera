"""Unit tests for ObjectDetector component."""

from unittest.mock import MagicMock
import numpy as np
import pytest
import supervision as sv

from app.vision.detector import ObjectDetector


def _create_mock_results(boxes_xyxy, boxes_conf, boxes_cls, names):
    """Helper to create realistic mocked Ultralytics Results object."""
    mock_results = MagicMock()
    mock_results.obb = None
    mock_results.masks = None
    mock_results.keypoints = None
    mock_results.probs = None

    mock_boxes = MagicMock()
    mock_boxes.id = None
    mock_boxes.xyxy.cpu().numpy.return_value = boxes_xyxy
    mock_boxes.conf.cpu().numpy.return_value = boxes_conf
    mock_boxes.cls.cpu().numpy.return_value = boxes_cls
    mock_results.boxes = mock_boxes
    mock_results.names = names
    return mock_results


def test_detector_none_results():
    """Verify detector returns empty detections when results are None."""
    detector = ObjectDetector()
    detections = detector.process_results(None)
    assert len(detections) == 0
    assert isinstance(detections, sv.Detections)


def test_detector_empty_results():
    """Verify detector handles results with zero detections."""
    detector = ObjectDetector(class_names={0: "person"})
    mock_results = _create_mock_results(
        boxes_xyxy=np.empty((0, 4)),
        boxes_conf=np.empty((0,)),
        boxes_cls=np.empty((0,)),
        names={0: "person"},
    )

    detections = detector.process_results(mock_results)
    assert len(detections) == 0


def test_detector_confidence_and_class_filtering():
    """Verify confidence and class name filtering."""
    detector = ObjectDetector(class_names={0: "person", 1: "dog", 2: "cat"})

    mock_results = _create_mock_results(
        boxes_xyxy=np.array([
            [10, 10, 50, 50],
            [60, 60, 100, 100],
            [110, 110, 150, 150],
        ]),
        boxes_conf=np.array([0.90, 0.40, 0.85]),
        boxes_cls=np.array([0, 1, 2]),
        names={0: "person", 1: "dog", 2: "cat"},
    )

    # Filter with min confidence 0.50 -> removes dog (0.40)
    det_conf = detector.process_results(mock_results, min_confidence=0.50)
    assert len(det_conf) == 2
    assert set(det_conf.class_id) == {0, 2}

    # Filter specifically for 'cat'
    det_class = detector.process_results(mock_results, filter_classes=["cat"])
    assert len(det_class) == 1
    assert det_class.class_id[0] == 2

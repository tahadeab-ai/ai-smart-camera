"""Unit tests for VisionAnnotator component."""

import numpy as np
import pytest
import supervision as sv

from app.vision.annotator import VisionAnnotator


def test_annotator_invalid_scene():
    """Verify ValueError is raised on invalid scene input."""
    annotator = VisionAnnotator()
    with pytest.raises(ValueError, match="Scene cannot be None or empty"):
        annotator.annotate(None, sv.Detections.empty())

    with pytest.raises(ValueError, match="Scene cannot be None or empty"):
        annotator.annotate(np.empty((0, 0, 3), dtype=np.uint8), sv.Detections.empty())


def test_annotator_empty_detections():
    """Verify empty detections return a copy of the scene with same shape and values."""
    annotator = VisionAnnotator()
    dummy_scene = np.ones((100, 100, 3), dtype=np.uint8) * 128
    result = annotator.annotate(dummy_scene, sv.Detections.empty())

    assert result.shape == dummy_scene.shape
    np.testing.assert_array_equal(result, dummy_scene)


def test_annotator_renders_annotations():
    """Verify annotations alter the image buffer (bounding boxes drawn)."""
    annotator = VisionAnnotator()
    dummy_scene = np.zeros((200, 200, 3), dtype=np.uint8)

    detections = sv.Detections(
        xyxy=np.array([[20, 20, 80, 80]]),
        confidence=np.array([0.95]),
        class_id=np.array([0]),
    )
    class_names = {0: "person"}

    annotated = annotator.annotate(dummy_scene, detections, class_names=class_names)
    assert annotated.shape == dummy_scene.shape
    # Ensure drawing modified the black canvas
    assert np.any(annotated > 0)

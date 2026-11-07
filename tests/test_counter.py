"""Unit tests for ObjectCounter component."""

import numpy as np
import supervision as sv

from app.vision.counter import ObjectCounter


def test_counter_empty_detections():
    """Verify counter handles empty detections gracefully."""
    empty_detections = sv.Detections.empty()
    stats = ObjectCounter.count(empty_detections)

    assert stats["total_count"] == 0
    assert stats["class_counts"] == {}
    assert "No objects detected" in stats["summary"]


def test_counter_none_detections():
    """Verify counter handles None gracefully."""
    stats = ObjectCounter.count(None)
    assert stats["total_count"] == 0
    assert stats["class_counts"] == {}


def test_counter_multiple_objects():
    """Verify counter correctly tallies multiple classes."""
    # Create synthetic detections
    xyxy = np.array([
        [10, 10, 50, 50],
        [60, 60, 120, 120],
        [130, 130, 200, 200],
    ])
    confidence = np.array([0.9, 0.85, 0.75])
    class_id = np.array([0, 0, 1])

    detections = sv.Detections(
        xyxy=xyxy,
        confidence=confidence,
        class_id=class_id,
    )
    class_names = {0: "person", 1: "bicycle"}

    stats = ObjectCounter.count(detections, class_names=class_names)
    assert stats["total_count"] == 3
    assert stats["class_counts"]["person"] == 2
    assert stats["class_counts"]["bicycle"] == 1
    assert "Total: 3" in stats["summary"]


def test_counter_markdown_formatting():
    """Verify markdown formatting output for both empty and populated stats."""
    empty_md = ObjectCounter.format_markdown_table({"total_count": 0, "class_counts": {}})
    assert "0 objects detected" in empty_md

    populated_stats = {
        "total_count": 5,
        "class_counts": {"car": 3, "bus": 2},
    }
    table_md = ObjectCounter.format_markdown_table(populated_stats)
    assert "Total: **5**" in table_md
    assert "| **car** | `3` |" in table_md
    assert "| **bus** | `2` |" in table_md

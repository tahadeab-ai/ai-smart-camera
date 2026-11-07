"""Object detector bridging YOLO results to Supervision Detections."""

import logging
from typing import Any

import numpy as np
import supervision as sv

logger = logging.getLogger(__name__)


class ObjectDetector:
    """Processes model outputs into structured Supervision Detections."""

    def __init__(self, class_names: dict[int, str] | None = None) -> None:
        self.class_names: dict[int, str] = class_names or {}

    def process_results(
        self,
        results: Any,
        filter_classes: list[str] | None = None,
        min_confidence: float = 0.0,
    ) -> sv.Detections:
        """Converts raw model prediction into a filtered Supervision Detections object."""
        if results is None:
            return sv.Detections.empty()

        detections = sv.Detections.from_ultralytics(results)

        # Update class names mapping if results contain names
        if hasattr(results, "names") and results.names:
            self.class_names = results.names

        if len(detections) == 0:
            return detections

        # Filter by minimum confidence if specified
        if min_confidence > 0.0 and detections.confidence is not None:
            mask = detections.confidence >= min_confidence
            detections = detections[mask]

        # Filter by class names if specified
        if filter_classes and len(detections) > 0 and detections.class_id is not None:
            valid_ids = [
                cid for cid, name in self.class_names.items() if name in filter_classes
            ]
            if valid_ids:
                class_mask = np.isin(detections.class_id, valid_ids)
                detections = detections[class_mask]
            else:
                detections = sv.Detections.empty()

        return detections

    def get_class_name(self, class_id: int) -> str:
        """Returns the human-readable class name for a given class ID."""
        return self.class_names.get(class_id, f"class_{class_id}")

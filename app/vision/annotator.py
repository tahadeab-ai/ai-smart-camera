"""Vision annotator using Supervision to draw boxes, labels, and confidences."""

import logging
import numpy as np
import supervision as sv

logger = logging.getLogger(__name__)


class VisionAnnotator:
    """Manages visual rendering of bounding boxes, tags, and confidence scores."""

    def __init__(
        self,
        thickness: int = 2,
        text_scale: float = 0.5,
        text_padding: int = 5,
    ) -> None:
        self.box_annotator = sv.BoxAnnotator(
            thickness=thickness,
        )
        self.label_annotator = sv.LabelAnnotator(
            text_scale=text_scale,
            text_padding=text_padding,
        )

    def annotate(
        self,
        scene: np.ndarray,
        detections: sv.Detections,
        class_names: dict[int, str] | None = None,
        show_confidence: bool = True,
    ) -> np.ndarray:
        """Annotates an RGB image scene with bounding boxes and labels.

        Args:
            scene: Input image as RGB numpy array (H, W, 3).
            detections: Supervision Detections object.
            class_names: Optional mapping from class_id to class string name.
            show_confidence: Whether to append percentage confidence to label.

        Returns:
            Annotated RGB numpy array.
        """
        if scene is None or scene.size == 0:
            raise ValueError("Scene cannot be None or empty.")

        annotated_scene = scene.copy()

        if detections is None or len(detections) == 0:
            return annotated_scene

        # Generate labels
        labels = []
        for i in range(len(detections)):
            class_id = int(detections.class_id[i]) if detections.class_id is not None else -1
            confidence = (
                float(detections.confidence[i])
                if detections.confidence is not None
                else 0.0
            )

            class_label = (
                class_names.get(class_id, f"ID:{class_id}")
                if class_names
                else f"ID:{class_id}"
            )

            if show_confidence:
                labels.append(f"{class_label} {confidence:.0%}")
            else:
                labels.append(class_label)

        # Apply Supervision annotators
        annotated_scene = self.box_annotator.annotate(
            scene=annotated_scene,
            detections=detections,
        )
        annotated_scene = self.label_annotator.annotate(
            scene=annotated_scene,
            detections=detections,
            labels=labels,
        )

        return annotated_scene

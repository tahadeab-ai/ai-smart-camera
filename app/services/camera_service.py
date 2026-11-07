"""Camera service orchestrating computer vision pipeline for stream and static images."""

import logging
import time
from typing import Any
import numpy as np
from PIL import Image

from app.core.inference import InferenceEngine
from app.core.model_loader import ModelLoader
from app.vision.annotator import VisionAnnotator
from app.vision.counter import ObjectCounter
from app.vision.detector import ObjectDetector

logger = logging.getLogger(__name__)


class CameraService:
    """High-level service coordinating model loading, inference, annotation, and counting."""

    def __init__(
        self,
        model_name: str = "yolov8n",
        device: str = "cpu",
        confidence_threshold: float = 0.25,
        iou_threshold: float = 0.45,
    ) -> None:
        self.model_name = model_name
        self.device = device
        self.confidence_threshold = confidence_threshold
        self.iou_threshold = iou_threshold

        # Initialize core components
        self.loader = ModelLoader()
        self.model, self.metadata = self.loader.load(model_name=model_name, device=device)
        self.inference_engine = InferenceEngine(model=self.model, device=device)
        self.detector = ObjectDetector(class_names=self.metadata.get("classes", {}))
        self.annotator = VisionAnnotator()
        self.counter = ObjectCounter()

        # Streaming state
        self._frame_counter = 0
        self._last_processed_time = 0.0

    def process_frame(
        self,
        frame: np.ndarray,
        confidence_threshold: float | None = None,
        filter_classes: list[str] | None = None,
        skip_interval: int = 1,
    ) -> tuple[np.ndarray, dict[str, Any], float]:
        """Processes a single incoming video camera frame.

        Args:
            frame: Incoming RGB video frame numpy array.
            confidence_threshold: Override confidence threshold if provided.
            filter_classes: Optional list of class names to display.
            skip_interval: Frame decimation (1 = process every frame, 2 = every 2nd).

        Returns:
            tuple of (annotated_frame, stats_dict, latency_ms).
        """
        if frame is None or frame.size == 0:
            return np.zeros((480, 640, 3), dtype=np.uint8), {"total_count": 0, "class_counts": {}}, 0.0

        self._frame_counter += 1
        conf = confidence_threshold if confidence_threshold is not None else self.confidence_threshold

        # Frame decimation for smooth streaming over mobile/remote networks
        if skip_interval > 1 and (self._frame_counter % skip_interval != 0):
            # Return current unannotated frame or cached with zero latency
            return frame, {"total_count": 0, "class_counts": {}, "skipped": True}, 0.0

        try:
            results, latency_ms = self.inference_engine.predict(
                image=frame,
                confidence_threshold=conf,
                iou_threshold=self.iou_threshold,
                image_size=640,
            )

            detections = self.detector.process_results(
                results=results,
                filter_classes=filter_classes,
                min_confidence=conf,
            )

            annotated_frame = self.annotator.annotate(
                scene=frame,
                detections=detections,
                class_names=self.detector.class_names,
                show_confidence=True,
            )

            stats = self.counter.count(
                detections=detections,
                class_names=self.detector.class_names,
            )

            return annotated_frame, stats, latency_ms
        except Exception as e:
            logger.error("Error processing camera frame: %s", e)
            # Fail safely: return original frame without crashing
            return frame, {"total_count": 0, "class_counts": {}, "error": str(e)}, 0.0

    def process_image(
        self,
        image_input: np.ndarray | Image.Image,
        confidence_threshold: float | None = None,
        iou_threshold: float | None = None,
        filter_classes: list[str] | None = None,
    ) -> tuple[np.ndarray, np.ndarray, dict[str, Any], float]:
        """Processes a static uploaded image.

        Args:
            image_input: Input RGB numpy array or PIL Image.
            confidence_threshold: Custom confidence threshold.
            iou_threshold: Custom IoU threshold.
            filter_classes: Optional list of class names.

        Returns:
            tuple of (original_rgb_image, annotated_rgb_image, stats_dict, latency_ms).
        """
        if image_input is None:
            raise ValueError("No image provided.")

        # Convert PIL Image to RGB numpy array if needed
        if isinstance(image_input, Image.Image):
            rgb_image = np.array(image_input.convert("RGB"))
        elif isinstance(image_input, np.ndarray):
            rgb_image = image_input.copy()
            if rgb_image.ndim == 2:
                rgb_image = np.stack([rgb_image] * 3, axis=-1)
        else:
            raise ValueError(f"Unsupported image type: {type(image_input)}")

        # Validate dimensions
        h, w = rgb_image.shape[:2]
        if h < 10 or w < 10 or h > 4096 or w > 4096:
            raise ValueError(f"Image dimensions ({w}x{h}) outside valid bounds (10x10 to 4096x4096).")

        conf = confidence_threshold if confidence_threshold is not None else self.confidence_threshold
        iou = iou_threshold if iou_threshold is not None else self.iou_threshold

        results, latency_ms = self.inference_engine.predict(
            image=rgb_image,
            confidence_threshold=conf,
            iou_threshold=iou,
            image_size=640,
        )

        detections = self.detector.process_results(
            results=results,
            filter_classes=filter_classes,
            min_confidence=conf,
        )

        annotated_image = self.annotator.annotate(
            scene=rgb_image,
            detections=detections,
            class_names=self.detector.class_names,
            show_confidence=True,
        )

        stats = self.counter.count(
            detections=detections,
            class_names=self.detector.class_names,
        )

        return rgb_image, annotated_image, stats, latency_ms

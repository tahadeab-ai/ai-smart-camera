"""Camera service orchestrating computer vision pipeline for stream and static images."""

import logging
import threading
from typing import Any

import cv2
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

        # Concurrency lock for model inference and switching
        self._lock = threading.Lock()

        # Initialize core components
        self.loader = ModelLoader()
        self.model, self.metadata = self.loader.load(model_name=model_name, device=device)
        self.inference_engine = InferenceEngine(model=self.model, device=device)
        self.detector = ObjectDetector(class_names=self.metadata.get("classes", {}))
        self.annotator = VisionAnnotator()
        self.counter = ObjectCounter()

        # Streaming state & frame skipping cache
        self._frame_counter = 0
        self._last_processed_time = 0.0
        self._last_detections = None
        self._last_annotated_frame: np.ndarray | None = None
        self._last_stats: dict[str, Any] = {"total_count": 0, "class_counts": {}}
        self._last_boxes: list[dict[str, Any]] = []

    def switch_model(self, model_name: str, device: str | None = None) -> dict[str, Any]:
        """Thread-safely switches the active YOLO model.

        Args:
            model_name: Model identifier (e.g. 'yolov8n', 'yolo11n').
            device: Optional target device override.

        Returns:
            Dictionary with switch status and metadata.
        """
        target_device = device or self.device
        with self._lock:
            logger.info("Switching model to '%s' on device '%s'...", model_name, target_device)
            new_model, new_metadata = self.loader.load(model_name=model_name, device=target_device)
            self.model = new_model
            self.metadata = new_metadata
            self.model_name = model_name
            self.device = target_device
            self.inference_engine = InferenceEngine(model=self.model, device=target_device)
            self.detector = ObjectDetector(class_names=self.metadata.get("classes", {}))

            # Reset streaming cache
            self._last_detections = None
            self._last_annotated_frame = None
            self._last_stats = {"total_count": 0, "class_counts": {}}
            self._last_boxes = []

            logger.info("Successfully switched model to '%s'.", model_name)
            return {
                "status": "success",
                "model_name": model_name,
                "device": target_device,
                "classes_count": len(self.detector.class_names),
            }

    def _extract_boxes(self, detections: Any) -> list[dict[str, Any]]:
        """Extracts structured serializable bounding boxes from Supervision Detections."""
        boxes: list[dict[str, Any]] = []
        if detections is None or len(detections) == 0:
            return boxes

        has_tracker = (
            hasattr(detections, "tracker_id") and detections.tracker_id is not None
        )
        for i in range(len(detections)):
            x1, y1, x2, y2 = detections.xyxy[i].tolist()
            conf = (
                float(detections.confidence[i])
                if detections.confidence is not None
                else 1.0
            )
            cid = int(detections.class_id[i]) if detections.class_id is not None else -1
            cname = self.detector.class_names.get(cid, str(cid))
            tracker_id = None
            if has_tracker and detections.tracker_id[i] is not None:
                try:
                    tracker_id = int(detections.tracker_id[i])
                except (ValueError, TypeError):
                    tracker_id = None
            boxes.append(
                {
                    "x1": round(float(x1), 2),
                    "y1": round(float(y1), 2),
                    "x2": round(float(x2), 2),
                    "y2": round(float(y2), 2),
                    "confidence": round(float(conf), 4),
                    "class_id": cid,
                    "class_name": cname,
                    "tracker_id": tracker_id,
                }
            )
        return boxes

    def process_frame(
        self,
        frame: np.ndarray,
        confidence_threshold: float | None = None,
        filter_classes: list[str] | None = None,
        skip_interval: int = 1,
    ) -> tuple[np.ndarray, dict[str, Any], float]:
        """Processes a single incoming video camera frame.

        Resolves the frame-skipping bug: skipped frames preserve the latest valid
        annotated frame or re-annotate the new scene with cached detections,
        guaranteeing bounding boxes and statistics do not flicker or drop to zero.

        Args:
            frame: Incoming RGB video frame numpy array.
            confidence_threshold: Override confidence threshold if provided.
            filter_classes: Optional list of class names to display.
            skip_interval: Frame decimation (1 = process every frame, 2 = every 2nd).

        Returns:
            tuple of (annotated_frame, stats_dict, latency_ms).
        """
        if frame is None or frame.size == 0:
            return (
                np.zeros((480, 640, 3), dtype=np.uint8),
                {"total_count": 0, "class_counts": {}},
                0.0,
            )

        self._frame_counter += 1
        conf = (
            confidence_threshold
            if confidence_threshold is not None
            else self.confidence_threshold
        )

        # Frame decimation for smooth streaming over mobile/remote networks
        if skip_interval > 1 and (self._frame_counter % skip_interval != 0):
            # If we have cached detections, re-annotate the new frame in <1ms without running YOLO
            if self._last_detections is not None:
                annotated_cached = self.annotator.annotate(
                    scene=frame,
                    detections=self._last_detections,
                    class_names=self.detector.class_names,
                    show_confidence=True,
                )
                stats = {**self._last_stats, "skipped": True}
                return annotated_cached, stats, 0.0

            # Fallback if no prior detections exist
            stats = {**self._last_stats, "skipped": True}
            return frame, stats, 0.0

        try:
            with self._lock:
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

                # Update streaming cache
                self._last_detections = detections
                self._last_annotated_frame = annotated_frame
                self._last_stats = stats
                self._last_boxes = self._extract_boxes(detections)

            return annotated_frame, {**stats, "skipped": False}, latency_ms
        except Exception as e:
            logger.error("Error processing camera frame: %s", e)
            # Fail safely: return original frame with last known stats or error note
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
        rgb_image, annotated_image, _, stats, latency_ms = self.process_image_detailed(
            image_input=image_input,
            confidence_threshold=confidence_threshold,
            iou_threshold=iou_threshold,
            filter_classes=filter_classes,
        )
        return rgb_image, annotated_image, stats, latency_ms

    def process_image_detailed(
        self,
        image_input: np.ndarray | Image.Image,
        confidence_threshold: float | None = None,
        iou_threshold: float | None = None,
        filter_classes: list[str] | None = None,
    ) -> tuple[np.ndarray, np.ndarray, list[dict[str, Any]], dict[str, Any], float]:
        """Processes a static uploaded image returning structured bounding boxes.

        Returns:
            tuple of (original_rgb, annotated_rgb, boxes_list, stats_dict, latency_ms).
        """
        if image_input is None:
            raise ValueError("No image provided.")

        if isinstance(image_input, Image.Image):
            rgb_image = np.array(image_input.convert("RGB"))
        elif isinstance(image_input, np.ndarray):
            rgb_image = image_input.copy()
            if rgb_image.ndim == 2:
                rgb_image = np.stack([rgb_image] * 3, axis=-1)
            elif rgb_image.ndim == 3 and rgb_image.shape[2] == 4:
                rgb_image = cv2.cvtColor(rgb_image, cv2.COLOR_RGBA2RGB)
        else:
            raise ValueError(f"Unsupported image type: {type(image_input)}")

        h, w = rgb_image.shape[:2]
        if h < 10 or w < 10 or h > 4096 or w > 4096:
            raise ValueError(
                f"Image dimensions ({w}x{h}) outside valid bounds (10x10 to 4096x4096)."
            )

        conf = (
            confidence_threshold
            if confidence_threshold is not None
            else self.confidence_threshold
        )
        iou = iou_threshold if iou_threshold is not None else self.iou_threshold

        with self._lock:
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

            boxes = self._extract_boxes(detections)

        return rgb_image, annotated_image, boxes, stats, latency_ms

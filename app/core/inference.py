"""Inference engine managing YOLO execution and latency tracking."""

import logging
import time
from typing import Any
import numpy as np
from PIL import Image
from ultralytics import YOLO

logger = logging.getLogger(__name__)


class InferenceEngine:
    """Manages model execution, preprocessing, and timing metrics."""

    def __init__(self, model: YOLO, device: str = "cpu") -> None:
        self.model = model
        self.device = device

    def predict(
        self,
        image: np.ndarray | Image.Image,
        confidence_threshold: float = 0.25,
        iou_threshold: float = 0.45,
        image_size: int = 640,
    ) -> tuple[Any, float]:
        """Runs object detection inference on an image.

        Args:
            image: Input image as RGB numpy array or PIL Image.
            confidence_threshold: Minimum detection confidence score (0.0 to 1.0).
            iou_threshold: Non-Maximum Suppression (NMS) IoU threshold.
            image_size: Inference resolution (default 640).

        Returns:
            tuple of (Ultralytics Results object, inference_time_ms).
        """
        if image is None:
            raise ValueError("Input image cannot be None.")

        # If numpy array, validate shape and non-empty
        if isinstance(image, np.ndarray):
            if image.size == 0 or image.ndim not in (2, 3):
                raise ValueError("Invalid image array format or empty array.")
            # Ensure 3 channels if 2D grayscale
            if image.ndim == 2:
                image = np.stack([image] * 3, axis=-1)

        start_time = time.perf_counter()
        results = self.model.predict(
            source=image,
            conf=confidence_threshold,
            iou=iou_threshold,
            imgsz=image_size,
            device=self.device,
            verbose=False,
        )
        latency_ms = (time.perf_counter() - start_time) * 1000.0

        first_result = results[0] if isinstance(results, list) and len(results) > 0 else results
        return first_result, round(latency_ms, 2)

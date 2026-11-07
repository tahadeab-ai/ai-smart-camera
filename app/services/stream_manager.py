"""Stream session manager coordinating real-time WebSocket video streams."""

import logging
import time
from collections import deque
from dataclasses import dataclass, field
from typing import Any

import cv2
import numpy as np

from app.services.camera_service import CameraService

logger = logging.getLogger(__name__)


@dataclass
class StreamConfig:
    """Per-connection stream configuration."""

    confidence_threshold: float = 0.25
    iou_threshold: float = 0.45
    filter_classes: list[str] = field(default_factory=list)
    skip_interval: int = 1
    return_annotated_frame: bool = True
    jpeg_quality: int = 75


class StreamSession:
    """Manages state, history, and frame decimation for a single WebSocket connection."""

    def __init__(self, session_id: str, config: StreamConfig | None = None) -> None:
        self.session_id = session_id
        self.config = config or StreamConfig()
        self.frame_counter = 0
        self.last_frame_id = 0

        # Cached state to eliminate frame-skipping flickering
        self.last_detections: Any = None
        self.last_annotated_jpeg: bytes | None = None
        self.last_stats: dict[str, Any] = {"total_count": 0, "class_counts": {}}
        self.last_boxes: list[dict[str, Any]] = []

        # FPS calculation window
        self._timestamps: deque[float] = deque(maxlen=20)

    def update_config(self, **kwargs: Any) -> None:
        """Dynamically updates stream settings (e.g. threshold, skip interval)."""
        for k, v in kwargs.items():
            if hasattr(self.config, k):
                setattr(self.config, k, v)
        logger.debug("Session %s updated config: %s", self.session_id, self.config)

    def calculate_fps(self) -> float:
        """Calculates current rolling frames-per-second."""
        now = time.monotonic()
        self._timestamps.append(now)
        if len(self._timestamps) < 2:
            return 0.0
        duration = self._timestamps[-1] - self._timestamps[0]
        if duration <= 0:
            return 0.0
        return round(float((len(self._timestamps) - 1) / duration), 1)

    def process_frame_bytes(
        self,
        camera_service: CameraService,
        frame_bytes: bytes,
        frame_id: int,
    ) -> tuple[dict[str, Any], bytes | None]:
        """Processes raw JPEG bytes from the client.

        Returns:
            tuple of (metadata_dict, annotated_jpeg_bytes_or_None).
        """
        self.frame_counter += 1
        self.last_frame_id = frame_id
        current_fps = self.calculate_fps()

        # Decode JPEG bytes to numpy RGB
        np_arr = np.frombuffer(frame_bytes, np.uint8)
        bgr_image = cv2.imdecode(np_arr, cv2.IMREAD_COLOR)
        if bgr_image is None:
            raise ValueError(f"Failed to decode incoming JPEG for frame {frame_id}")

        rgb_frame = cv2.cvtColor(bgr_image, cv2.COLOR_BGR2RGB)
        skip = self.config.skip_interval

        # Check frame decimation condition
        is_skipped = skip > 1 and (self.frame_counter % skip != 0)

        if is_skipped:
            # Re-annotate the new incoming frame using last detections in <1ms
            if self.last_detections is not None:
                annotated_rgb = camera_service.annotator.annotate(
                    scene=rgb_frame,
                    detections=self.last_detections,
                    class_names=camera_service.detector.class_names,
                    show_confidence=True,
                )
                annotated_bgr = cv2.cvtColor(annotated_rgb, cv2.COLOR_RGB2BGR)
                success, encoded = cv2.imencode(
                    ".jpg",
                    annotated_bgr,
                    [cv2.IMWRITE_JPEG_QUALITY, self.config.jpeg_quality],
                )
                annotated_bytes = encoded.tobytes() if success else None
            else:
                annotated_bytes = self.last_annotated_jpeg

            metadata = {
                "type": "detection",
                "frame_id": frame_id,
                "timestamp": round(time.time(), 3),
                "latency_ms": 0.0,
                "fps": current_fps,
                "stats": self.last_stats,
                "detections": self.last_boxes,
                "skipped": True,
            }
            return metadata, annotated_bytes

        # Run full inference pipeline
        start_t = time.perf_counter()
        with camera_service._lock:
            results, model_latency_ms = camera_service.inference_engine.predict(
                image=rgb_frame,
                confidence_threshold=self.config.confidence_threshold,
                iou_threshold=self.config.iou_threshold,
                image_size=640,
            )

            detections = camera_service.detector.process_results(
                results=results,
                filter_classes=self.config.filter_classes or None,
                min_confidence=self.config.confidence_threshold,
            )

            annotated_rgb = camera_service.annotator.annotate(
                scene=rgb_frame,
                detections=detections,
                class_names=camera_service.detector.class_names,
                show_confidence=True,
            )

            stats = camera_service.counter.count(
                detections=detections,
                class_names=camera_service.detector.class_names,
            )

            boxes = camera_service._extract_boxes(detections)

        total_latency_ms = round((time.perf_counter() - start_t) * 1000, 2)

        # Encode annotated image if requested
        annotated_bytes = None
        if self.config.return_annotated_frame:
            annotated_bgr = cv2.cvtColor(annotated_rgb, cv2.COLOR_RGB2BGR)
            success, encoded = cv2.imencode(
                ".jpg",
                annotated_bgr,
                [cv2.IMWRITE_JPEG_QUALITY, self.config.jpeg_quality],
            )
            if success:
                annotated_bytes = encoded.tobytes()

        # Update cache for smooth transitions
        self.last_detections = detections
        self.last_stats = stats
        self.last_boxes = boxes
        self.last_annotated_jpeg = annotated_bytes

        metadata = {
            "type": "detection",
            "frame_id": frame_id,
            "timestamp": round(time.time(), 3),
            "latency_ms": total_latency_ms,
            "fps": current_fps,
            "stats": stats,
            "detections": boxes,
            "skipped": False,
        }

        return metadata, annotated_bytes


class StreamManager:
    """Manages active streaming sessions and concurrency limits."""

    def __init__(self, max_concurrent: int = 5) -> None:
        self.max_concurrent = max_concurrent
        self._sessions: dict[str, StreamSession] = {}

    @property
    def active_count(self) -> int:
        return len(self._sessions)

    def create_session(
        self, session_id: str, config: StreamConfig | None = None
    ) -> StreamSession:
        """Creates and registers a new stream session."""
        if len(self._sessions) >= self.max_concurrent:
            raise RuntimeError(
                f"Maximum concurrent streams ({self.max_concurrent}) reached. Please try again later."
            )
        session = StreamSession(session_id=session_id, config=config)
        self._sessions[session_id] = session
        logger.info(
            "Session %s created. Active streams: %d/%d",
            session_id,
            len(self._sessions),
            self.max_concurrent,
        )
        return session

    def get_session(self, session_id: str) -> StreamSession | None:
        return self._sessions.get(session_id)

    def remove_session(self, session_id: str) -> None:
        if session_id in self._sessions:
            del self._sessions[session_id]
            logger.info(
                "Session %s removed. Active streams: %d/%d",
                session_id,
                len(self._sessions),
                self.max_concurrent,
            )


# Global singleton instance
stream_manager = StreamManager()

"""Stream session manager coordinating real-time WebSocket video streams with atomic concurrency and thread safety."""

import logging
import threading
import time
from collections import deque
from dataclasses import dataclass, field
from typing import Any

import cv2
import numpy as np
import supervision as sv

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
    enable_tracking: bool = True
    enable_trails: bool = True
    trace_length: int = 30
    target_fps: int = 15


class StreamSession:
    """Manages state, history, tracking, and frame decimation for a single WebSocket connection."""

    def __init__(self, session_id: str, config: StreamConfig | None = None) -> None:
        self.session_id = session_id
        self.config = config or StreamConfig()
        self.frame_counter = 0
        self.last_frame_id = 0
        self.last_inference_time = 0.0

        # Isolated tracking components per session
        self.tracker: sv.ByteTrack | None = None
        self.trace_annotator: sv.TraceAnnotator | None = None
        self._init_tracker()

        # Cached state to eliminate frame-skipping flickering
        self.last_detections: Any = None
        self.last_annotated_jpeg: bytes | None = None
        self.last_stats: dict[str, Any] = {
            "total_count": 0,
            "class_counts": {},
            "tracked_count": 0,
            "tracked_class_counts": {},
        }
        self.last_boxes: list[dict[str, Any]] = []

        # Telemetry for backpressure and queue drops
        self.dropped_frames: int = 0
        self.queue_replacements: int = 0

        # FPS calculation window
        self._timestamps: deque[float] = deque(maxlen=20)
        self._lock = threading.Lock()
        self.reset_epoch: int = 0

    def _init_tracker(self) -> None:
        """Initializes an isolated ByteTrack and TraceAnnotator instance for this session.

        Effective update rate note:
        In ByteTrack, `lost_track_buffer` represents an integer count of tracking update steps
        rather than elapsed real-world seconds. When `skip_interval > 1`, inference updates occur
        only every N incoming frames. If incoming frame rate is F_in (~12-15 FPS) and skip_interval is 2,
        the effective tracking update rate F_eff is ~6-8 FPS. A buffer of 30 steps corresponds to
        ~4-5 seconds of real-world track retention. `frame_rate` provides a reference update rate scale.
        """
        effective_fps = max(
            1, int(self.config.target_fps / max(1, self.config.skip_interval))
        )
        self.tracker = sv.ByteTrack(
            track_activation_threshold=self.config.confidence_threshold,
            lost_track_buffer=30,
            minimum_matching_threshold=0.8,
            frame_rate=effective_fps,
        )
        self.trace_annotator = sv.TraceAnnotator(
            trace_length=self.config.trace_length,
            thickness=2,
            color_lookup=sv.ColorLookup.TRACK,
        )

    def reset_tracker(self) -> int:
        """Completely resets tracking state, motion trails, and cached frame detections.

        Increments reset_epoch under lock to invalidate any in-flight inference threads.
        Used on stream initialization, camera switching, or explicit client reset.
        """
        with self._lock:
            self.reset_epoch += 1
            if self.tracker is not None:
                try:
                    self.tracker.reset()
                except Exception:
                    pass
            self._init_tracker()
            self.last_detections = None
            self.last_boxes = []
            self.last_stats = {
                "total_count": 0,
                "class_counts": {},
                "tracked_count": 0,
                "tracked_class_counts": {},
            }
            self.last_annotated_jpeg = None
            self.dropped_frames = 0
            self.queue_replacements = 0
            logger.info("Session %s tracker reset (epoch: %d).", self.session_id, self.reset_epoch)
            return self.reset_epoch

    def update_config(self, **kwargs: Any) -> None:
        """Dynamically updates stream settings (e.g. threshold, skip interval, tracking)."""
        with self._lock:
            # Handle alias tracking_enabled <-> enable_tracking
            if "tracking_enabled" in kwargs and "enable_tracking" not in kwargs:
                kwargs["enable_tracking"] = kwargs.pop("tracking_enabled")
            if "skip_interval" in kwargs and kwargs["skip_interval"] is not None:
                kwargs["skip_interval"] = max(1, int(kwargs["skip_interval"]))

            reinit_tracker = False
            for k, v in kwargs.items():
                if hasattr(self.config, k):
                    setattr(self.config, k, v)
                    if k in ("trace_length", "target_fps", "skip_interval", "confidence_threshold"):
                        reinit_tracker = True

            if reinit_tracker:
                effective_fps = max(
                    1, int(self.config.target_fps / max(1, self.config.skip_interval))
                )
                if self.tracker is not None:
                    self.tracker.track_activation_threshold = self.config.confidence_threshold
                    self.tracker.frame_rate = effective_fps
                if self.trace_annotator is not None:
                    self.trace_annotator = sv.TraceAnnotator(
                        trace_length=self.config.trace_length,
                        thickness=2,
                        color_lookup=sv.ColorLookup.TRACK,
                    )
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
        receive_timestamp: float | None = None,
        expected_epoch: int | None = None,
    ) -> tuple[dict[str, Any] | None, bytes | None]:
        """Processes raw JPEG bytes from the client with decomposed timing metrics.

        Args:
            camera_service: Global CameraService singleton.
            frame_bytes: Raw JPEG bytes.
            frame_id: Monotonic integer frame identifier.
            receive_timestamp: Monotonic reception timestamp for queue dwell calculation.
            expected_epoch: Reset epoch when frame was enqueued. If epoch advanced during
                inference, the frame is stale and discarded (returns None, None).

        Returns:
            tuple of (metadata_dict_or_None, annotated_jpeg_bytes_or_None).
        """
        # Discard stale frame immediately if reset occurred before execution started
        if expected_epoch is not None and self.reset_epoch != expected_epoch:
            return None, None

        frame_start_t = time.perf_counter()
        queue_latency_ms = (
            round((frame_start_t - receive_timestamp) * 1000, 2)
            if receive_timestamp is not None
            else 0.0
        )
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

        # Check frame decimation condition (frame 1 always runs full inference)
        is_skipped = skip > 1 and self.frame_counter > 1 and ((self.frame_counter - 1) % skip != 0)

        if is_skipped:
            with self._lock:
                if expected_epoch is not None and self.reset_epoch != expected_epoch:
                    return None, None

                # Re-annotate incoming frame using cached detections in <1ms
                ann_start_t = time.perf_counter()
                annotated_bytes = None

                if self.last_detections is not None and self.config.return_annotated_frame:
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

                annotation_ms = round((time.perf_counter() - ann_start_t) * 1000, 2)
                total_processing_ms = round((time.perf_counter() - frame_start_t) * 1000, 2)

                metadata = {
                    "type": "detection",
                    "frame_id": frame_id,
                    "timestamp": round(time.time(), 3),
                    "latency_ms": total_processing_ms,
                    "queue_latency_ms": queue_latency_ms,
                    "model_inference_ms": 0.0,
                    "annotation_ms": annotation_ms,
                    "frame_processing_ms": total_processing_ms,
                    "fps": current_fps,
                    "stats": self.last_stats,
                    "detections": self.last_boxes,
                    "frame_skipped": True,
                    "skipped": True,
                    "dropped_frames": self.dropped_frames,
                    "queue_replacements": self.queue_replacements,
                }
                return metadata, annotated_bytes

        # Run full inference pipeline
        model_start_t = time.perf_counter()
        imgsz = getattr(self.config, "image_size", 416)
        with camera_service._lock:
            results, _ = camera_service.inference_engine.predict(
                image=rgb_frame,
                confidence_threshold=self.config.confidence_threshold,
                iou_threshold=self.config.iou_threshold,
                image_size=imgsz,
            )

            raw_detections = camera_service.detector.process_results(
                results=results,
                filter_classes=self.config.filter_classes or None,
                min_confidence=self.config.confidence_threshold,
            )
            model_inference_ms = round((time.perf_counter() - model_start_t) * 1000, 2)

            # 1. Calculate raw detection statistics BEFORE ByteTrack
            raw_stats = camera_service.counter.count(
                detections=raw_detections,
                class_names=camera_service.detector.class_names,
            )
            raw_total_count = raw_stats.get("total_count", 0)
            raw_class_counts = raw_stats.get("class_counts", {})

        # Guard against tracker mutations if a reset arrived while inference was in flight
        with self._lock:
            if expected_epoch is not None and self.reset_epoch != expected_epoch:
                return None, None

            # 2. Update with ByteTrack (per-session tracker)
            if self.config.enable_tracking and self.tracker is not None:
                tracked_detections = self.tracker.update_with_detections(raw_detections)
            else:
                tracked_detections = raw_detections

            # 3. Calculate tracked object statistics AFTER tracking
            tracked_count = 0
            tracked_class_counts: dict[str, int] = {}
            if (
                hasattr(tracked_detections, "tracker_id")
                and tracked_detections.tracker_id is not None
            ):
                for idx, tid in enumerate(tracked_detections.tracker_id):
                    if tid is not None:
                        tracked_count += 1
                        cid = (
                            int(tracked_detections.class_id[idx])
                            if tracked_detections.class_id is not None
                            else -1
                        )
                        cname = camera_service.detector.class_names.get(cid, str(cid))
                        tracked_class_counts[cname] = (
                            tracked_class_counts.get(cname, 0) + 1
                        )

            ann_start_t = time.perf_counter()
            annotated_rgb = rgb_frame.copy()

            # 4. Render motion trails if tracking and trails enabled (session-isolated)
            if (
                self.config.enable_tracking
                and self.config.enable_trails
                and self.trace_annotator is not None
                and hasattr(tracked_detections, "tracker_id")
                and tracked_detections.tracker_id is not None
                and len(tracked_detections) > 0
            ):
                try:
                    annotated_rgb = self.trace_annotator.annotate(
                        scene=annotated_rgb, detections=tracked_detections
                    )
                except Exception as e:
                    logger.warning("TraceAnnotator error: %s", e)

            # 5. Render bounding boxes and labels (stateless shared annotator)
            annotated_rgb = camera_service.annotator.annotate(
                scene=annotated_rgb,
                detections=tracked_detections,
                class_names=camera_service.detector.class_names,
                show_confidence=True,
            )

            boxes = camera_service._extract_boxes(tracked_detections)
            annotation_ms = round((time.perf_counter() - ann_start_t) * 1000, 2)

            stats = {
                "total_count": raw_total_count,
                "class_counts": raw_class_counts,
                "tracked_count": tracked_count,
                "tracked_class_counts": tracked_class_counts,
            }

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

            # Update cache for smooth frame decimation
            self.last_detections = tracked_detections
            self.last_stats = stats
            self.last_boxes = boxes
            self.last_annotated_jpeg = annotated_bytes
            self.last_inference_time = time.time()

        total_processing_ms = round((time.perf_counter() - frame_start_t) * 1000, 2)

        metadata = {
            "type": "detection",
            "frame_id": frame_id,
            "timestamp": round(time.time(), 3),
            "latency_ms": total_processing_ms,
            "queue_latency_ms": queue_latency_ms,
            "model_inference_ms": model_inference_ms,
            "annotation_ms": annotation_ms,
            "frame_processing_ms": total_processing_ms,
            "fps": current_fps,
            "stats": stats,
            "detections": boxes,
            "frame_skipped": False,
            "skipped": False,
            "dropped_frames": self.dropped_frames,
            "queue_replacements": self.queue_replacements,
        }

        return metadata, annotated_bytes


class StreamManager:
    """Manages active streaming sessions with thread-safe atomic slot reservation."""

    def __init__(self, max_concurrent: int = 5) -> None:
        self.max_concurrent = max_concurrent
        self._sessions: dict[str, StreamSession] = {}
        self._reserved_slots: set[str] = set()
        self._lock = threading.Lock()

    @property
    def active_count(self) -> int:
        with self._lock:
            return len(self._sessions) + len(self._reserved_slots)

    def reserve_slot(self, session_id: str) -> bool:
        """Atomically checks and reserves a concurrency slot before WebSocket acceptance."""
        with self._lock:
            total_active = len(self._sessions) + len(self._reserved_slots)
            if total_active >= self.max_concurrent:
                logger.warning(
                    "Reservation rejected: %d/%d slots occupied.",
                    total_active,
                    self.max_concurrent,
                )
                return False
            self._reserved_slots.add(session_id)
            logger.debug("Reserved slot for session %s (%d/%d)", session_id, total_active + 1, self.max_concurrent)
            return True

    def release_reservation(self, session_id: str) -> None:
        """Releases a reserved slot if session creation fails or aborts."""
        with self._lock:
            self._reserved_slots.discard(session_id)

    def create_session(
        self, session_id: str, config: StreamConfig | None = None
    ) -> StreamSession:
        """Creates and registers a new stream session, promoting reservation."""
        with self._lock:
            self._reserved_slots.discard(session_id)
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
        with self._lock:
            return self._sessions.get(session_id)

    def remove_session(self, session_id: str) -> None:
        with self._lock:
            self._reserved_slots.discard(session_id)
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

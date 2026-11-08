"""Standalone verification script demonstrating ByteTrack and TraceAnnotator multi-frame operation."""

import io
import os
from unittest.mock import MagicMock

import cv2
import numpy as np
import supervision as sv
from PIL import Image

from app.services.camera_service import CameraService
from app.services.stream_manager import StreamConfig, StreamSession
from app.vision.annotator import VisionAnnotator
from app.vision.counter import ObjectCounter


def main() -> None:
    print("=" * 65)
    print("VERIFYING BYTETRACK & TRACEANNOTATOR MULTI-FRAME OPERATION")
    print("=" * 65)

    # 1. Setup StreamSession with tracking & trails
    config = StreamConfig(
        enable_tracking=True,
        enable_trails=True,
        trace_length=30,
        skip_interval=1,
        return_annotated_frame=True,
    )
    session = StreamSession(session_id="demo-session", config=config)

    # 2. Setup mock camera service
    service = MagicMock(spec=CameraService)
    service._lock = MagicMock()
    service._lock.__enter__ = lambda s: None
    service._lock.__exit__ = lambda s, *a: False
    service.inference_engine = MagicMock()
    service.detector = MagicMock()
    service.detector.class_names = {0: "person"}
    service.annotator = VisionAnnotator()
    service.counter = ObjectCounter()

    def _extract(dets=None, *args, **kwargs):
        if dets is None or len(dets) == 0:
            return []
        boxes = []
        for i in range(len(dets)):
            tid = (
                int(dets.tracker_id[i])
                if (
                    hasattr(dets, "tracker_id")
                    and dets.tracker_id is not None
                    and len(dets.tracker_id) > i
                    and dets.tracker_id[i] is not None
                )
                else None
            )
            boxes.append({
                "x1": float(dets.xyxy[i][0]),
                "y1": float(dets.xyxy[i][1]),
                "x2": float(dets.xyxy[i][2]),
                "y2": float(dets.xyxy[i][3]),
                "class_name": "person",
                "confidence": float(dets.confidence[i]) if dets.confidence is not None else 1.0,
                "tracker_id": tid,
            })
        return boxes

    service._extract_boxes = _extract

    # 3. Feed 10 synthetic frames of a smoothly moving person across the screen
    # Starting at (50, 100, 120, 260) and moving horizontally by 15px each frame
    track_history = []
    last_annotated_bytes = None

    for frame_idx in range(1, 11):
        x_shift = (frame_idx - 1) * 15
        y_shift = int(5 * np.sin(frame_idx))
        box = [50 + x_shift, 100 + y_shift, 120 + x_shift, 260 + y_shift]

        # Synthetic frame image
        img_arr = np.zeros((480, 640, 3), dtype=np.uint8)
        cv2.rectangle(img_arr, (box[0], box[1]), (box[2], box[3]), (50, 50, 50), -1)

        buf = io.BytesIO()
        Image.fromarray(img_arr).save(buf, format="JPEG")
        frame_bytes = buf.getvalue()

        mock_detections = sv.Detections(
            xyxy=np.array([box], dtype=np.float32),
            confidence=np.array([0.94], dtype=np.float32),
            class_id=np.array([0], dtype=np.int32),
        )
        service.detector.process_results.return_value = mock_detections
        service.inference_engine.predict.return_value = (None, 8.5)

        meta, ann_bytes = session.process_frame_bytes(service, frame_bytes, frame_id=frame_idx)
        last_annotated_bytes = ann_bytes

        detections = meta["detections"]
        assert len(detections) == 1
        t_id = detections[0]["tracker_id"]
        track_history.append(t_id)
        print(
            f"Frame {frame_idx:02d}: Box={[int(c) for c in box]}, "
            f"Tracker ID=#{t_id}, Tracked Count={meta['stats']['tracked_count']}"
        )

    # Assertions
    assert len(set(track_history)) == 1, (
        f"Expected 1 persistent tracker ID across 10 frames, got {set(track_history)}"
    )
    persistent_id = track_history[0]
    assert persistent_id is not None
    print(f"\n[VERIFIED] Persistent Tracker ID across all 10 frames: #{persistent_id}")

    trace_points = session.trace_annotator.trace.get(persistent_id)
    assert len(trace_points) == 10, f"Expected 10 trace points in history, got {len(trace_points)}"
    print(f"[VERIFIED] Trace history points count: {len(trace_points)}")
    print(f"[VERIFIED] Trace coordinates:\n{trace_points}")

    # Save sample frame to verify visual annotations
    out_dir = "/content/verification" if os.path.exists("/content") else "artifacts"
    os.makedirs(out_dir, exist_ok=True)
    output_path = os.path.join(out_dir, "tracking_trail_demo.jpg")
    with open(output_path, "wb") as f:
        f.write(last_annotated_bytes)

    assert os.path.exists(output_path) and os.path.getsize(output_path) > 1000
    print(f"[VERIFIED] Saved visual trail demo JPEG to {output_path} ({os.path.getsize(output_path)} bytes)")
    print("=" * 65)
    print("STEP 1 TRACKING PIPELINE DEMONSTRATION & VERIFICATION SUCCESSFUL")
    print("=" * 65)


if __name__ == "__main__":
    main()

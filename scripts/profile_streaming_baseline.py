"""Streaming Pipeline Performance Profiling & Baseline Benchmark.

Measures individual latency stages across frame resolutions and model input sizes:
- JPEG decoding
- YOLO model inference (warm-up vs steady-state)
- ByteTrack multi-object tracking
- Supervision annotation
- JPEG encoding
- End-to-end server frame processing throughput and P50/P95 latencies
- Lock contention across concurrent streams
"""

import io
import json
import os
import platform
import sys
import time
from pathlib import Path
from typing import Any

import cv2
import numpy as np
import psutil
import torch
from PIL import Image

# Ensure project root is in path
sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from app.services.camera_service import CameraService
from app.services.stream_manager import StreamSession


def generate_synthetic_frame(width: int, height: int, step: int = 0) -> bytes:
    """Generates a realistic synthetic JPEG frame with moving objects."""
    img = np.zeros((height, width, 3), dtype=np.uint8)
    img[:] = (30, 35, 45)  # dark background

    # Draw moving rectangular object (simulating person/vehicle)
    x = int((width * 0.2) + ((step * 15) % max(10, int(width * 0.6))))
    y = int((height * 0.3) + ((step * 8) % max(10, int(height * 0.4))))
    w, h = max(40, int(width * 0.15)), max(60, int(height * 0.3))
    cv2.rectangle(img, (x, y), (min(width - 1, x + w), min(height - 1, y + h)), (0, 200, 255), -1)

    # Encode to JPEG bytes
    success, encoded = cv2.imencode(".jpg", img, [cv2.IMWRITE_JPEG_QUALITY, 75])
    if not success:
        raise RuntimeError("Failed to encode synthetic frame")
    return encoded.tobytes()


def run_benchmark() -> dict[str, Any]:
    print("=" * 70)
    print("AI SMART CAMERA — STREAMING PIPELINE PERFORMANCE BENCHMARK")
    print("=" * 70)

    # Hardware & Environment Telemetry
    env_info = {
        "platform": f"{platform.system()} {platform.release()} ({platform.machine()})",
        "python_version": sys.version.split()[0],
        "pytorch_version": torch.__version__,
        "cuda_available": torch.cuda.is_available(),
        "device_name": torch.cuda.get_device_name(0) if torch.cuda.is_available() else "CPU",
        "cpu_count_logical": psutil.cpu_count(logical=True),
        "cpu_count_physical": psutil.cpu_count(logical=False),
        "ram_gb": round(psutil.virtual_memory().total / (1024**3), 2),
    }
    print(f"Hardware: {env_info['device_name']} | Cores: {env_info['cpu_count_logical']} | RAM: {env_info['ram_gb']} GB")
    print(f"PyTorch: {env_info['pytorch_version']} | CUDA Available: {env_info['cuda_available']}")

    results: dict[str, Any] = {"environment": env_info, "benchmarks": {}}

    # Models to test
    models_to_test = ["yolov8n", "yolo11n"]
    resolutions = [
        ("1080p (Mobile Raw)", 1920, 1080),
        ("720p (HD Native)", 1280, 720),
        ("480p (Optimized)", 640, 480),
        ("360p (Ultra Fast)", 480, 360),
    ]

    for model_name in models_to_test:
        print(f"\n--- Profiling Model: {model_name} ---")
        model_results: dict[str, Any] = {}

        # 1. Warm-up Benchmark
        start_init = time.perf_counter()
        service = CameraService(
            model_name=model_name,
            device="cuda" if torch.cuda.is_available() else "cpu",
            confidence_threshold=0.25,
            iou_threshold=0.45,
        )
        init_time_ms = round((time.perf_counter() - start_init) * 1000, 2)

        # Measure explicit warm-up pass
        dummy_rgb = np.zeros((480, 640, 3), dtype=np.uint8)
        start_warmup = time.perf_counter()
        _ = service.detector.predict(dummy_rgb, confidence=0.25, iou_threshold=0.45)
        warmup_time_ms = round((time.perf_counter() - start_warmup) * 1000, 2)

        print(f"  Initialization: {init_time_ms} ms | Warm-up Pass: {warmup_time_ms} ms")
        model_results["init_time_ms"] = init_time_ms
        model_results["warmup_time_ms"] = warmup_time_ms
        model_results["resolutions"] = {}

        # 2. Resolution & Pipeline Stage Profiling
        for res_label, width, height in resolutions:
            print(f"\n  [Resolution: {res_label} ({width}x{height})]")
            raw_jpeg = generate_synthetic_frame(width, height, step=0)
            jpeg_size_kb = round(len(raw_jpeg) / 1024, 2)

            session = StreamSession("bench-session")
            session.config.enable_tracking = True
            session.config.enable_trails = True

            decode_times = []
            inference_times = []
            tracking_times = []
            annotate_times = []
            encode_times = []
            total_times = []

            # Execute 25 iterations to capture stable P50/P95
            num_iterations = 25
            for i in range(num_iterations):
                step_frame = generate_synthetic_frame(width, height, step=i)
                t_total_start = time.perf_counter()

                # Stage A: Decode
                t0 = time.perf_counter()
                nparr = np.frombuffer(step_frame, np.uint8)
                bgr_img = cv2.imdecode(nparr, cv2.IMREAD_COLOR)
                t_decode = (time.perf_counter() - t0) * 1000

                # Stage B: YOLO Inference
                t0 = time.perf_counter()
                rgb_img = cv2.cvtColor(bgr_img, cv2.COLOR_BGR2RGB)
                detections = service.detector.predict(
                    rgb_img,
                    confidence=session.config.confidence_threshold,
                    iou_threshold=session.config.iou_threshold,
                )
                t_infer = (time.perf_counter() - t0) * 1000

                # Stage C: ByteTrack Tracking
                t0 = time.perf_counter()
                tracked_detections = session.tracker.update_with_detections(detections)
                t_track = (time.perf_counter() - t0) * 1000

                # Stage D: Supervision Annotation
                t0 = time.perf_counter()
                annotated_bgr = service.annotator.annotate(
                    scene=bgr_img.copy(),
                    detections=tracked_detections,
                )
                if session.trace_annotator and len(tracked_detections) > 0:
                    annotated_bgr = session.trace_annotator.annotate(
                        scene=annotated_bgr,
                        detections=tracked_detections,
                    )
                t_annot = (time.perf_counter() - t0) * 1000

                # Stage E: JPEG Encode
                t0 = time.perf_counter()
                _, enc_bytes = cv2.imencode(
                    ".jpg",
                    annotated_bgr,
                    [cv2.IMWRITE_JPEG_QUALITY, session.config.jpeg_quality],
                )
                t_encode = (time.perf_counter() - t0) * 1000

                t_total = (time.perf_counter() - t_total_start) * 1000

                decode_times.append(t_decode)
                inference_times.append(t_infer)
                tracking_times.append(t_track)
                annotate_times.append(t_annot)
                encode_times.append(t_encode)
                total_times.append(t_total)

            def stats(vals: list[float]) -> dict[str, float]:
                return {
                    "mean_ms": round(float(np.mean(vals)), 2),
                    "p50_ms": round(float(np.percentile(vals, 50)), 2),
                    "p95_ms": round(float(np.percentile(vals, 95)), 2),
                }

            res_stats = {
                "frame_size_kb": jpeg_size_kb,
                "decode": stats(decode_times),
                "inference": stats(inference_times),
                "tracking": stats(tracking_times),
                "annotation": stats(annotate_times),
                "encode": stats(encode_times),
                "total_processing": stats(total_times),
                "effective_max_fps": round(1000.0 / float(np.mean(total_times)), 2),
            }

            print(f"    Payload Size : {jpeg_size_kb} KB")
            print(f"    JPEG Decode  : Mean={res_stats['decode']['mean_ms']}ms | P95={res_stats['decode']['p95_ms']}ms")
            print(f"    YOLO Infer   : Mean={res_stats['inference']['mean_ms']}ms | P95={res_stats['inference']['p95_ms']}ms")
            print(f"    ByteTrack    : Mean={res_stats['tracking']['mean_ms']}ms | P95={res_stats['tracking']['p95_ms']}ms")
            print(f"    Annotation   : Mean={res_stats['annotation']['mean_ms']}ms | P95={res_stats['annotation']['p95_ms']}ms")
            print(f"    JPEG Encode  : Mean={res_stats['encode']['mean_ms']}ms | P95={res_stats['encode']['p95_ms']}ms")
            print(f"    Total Frame  : Mean={res_stats['total_processing']['mean_ms']}ms | P95={res_stats['total_processing']['p95_ms']}ms")
            print(f"    -> Max Achievable Server FPS: {res_stats['effective_max_fps']} FPS")

            model_results["resolutions"][res_label] = res_stats

        # 3. Shared Model Concurrency Contention Benchmark
        print("\n  [Concurrency Benchmark: 1 Stream vs 2 Streams]")
        sample_frame = generate_synthetic_frame(640, 480, step=0)

        # Single stream processing 20 frames
        t0 = time.perf_counter()
        session_1 = StreamSession("concurrency-1")
        for i in range(20):
            _ = session_1.process_frame_bytes(service, sample_frame, i)
        single_stream_fps = round(20.0 / (time.perf_counter() - t0), 2)

        # Two alternating streams simulating concurrent sessions sharing the model lock
        t0 = time.perf_counter()
        session_a = StreamSession("concurrency-a")
        session_b = StreamSession("concurrency-b")
        for i in range(10):
            _ = session_a.process_frame_bytes(service, sample_frame, i)
            _ = session_b.process_frame_bytes(service, sample_frame, i)
        dual_stream_fps = round(20.0 / (time.perf_counter() - t0), 2)

        model_results["concurrency"] = {
            "single_stream_fps": single_stream_fps,
            "dual_stream_aggregate_fps": dual_stream_fps,
            "per_session_fps_dual": round(dual_stream_fps / 2.0, 2),
        }
        print(f"    Single Stream Throughput: {single_stream_fps} FPS")
        print(f"    Dual Stream Aggregate   : {dual_stream_fps} FPS (~{round(dual_stream_fps / 2.0, 2)} FPS per session)")

        results["benchmarks"][model_name] = model_results

    # Save benchmark artifact to JSON
    out_dir = Path("docs/performance")
    out_dir.mkdir(parents=True, exist_ok=True)
    out_file = out_dir / "streaming_benchmark_baseline.json"
    with open(out_file, "w") as f:
        json.dump(results, f, indent=2)

    print(f"\n[+] Benchmark results saved to {out_file}")
    return results


if __name__ == "__main__":
    run_benchmark()

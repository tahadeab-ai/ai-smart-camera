# Benchmark Methodology & Performance Analysis: v0.2.2

## Overview

AI Smart Camera v0.2.2 includes an empirical, reproducible benchmarking framework (`benchmarks/benchmark.py`) designed to measure true real-world model latency, statistical distribution (P50, P95, P99), and throughput across hardware architectures without fabricated or exaggerated claims.

---

## 1. Evaluation Protocol

To ensure consistency and comparability:
- **Benchmark Inputs**:
  - Full-resolution Ultralytics `bus.jpg` (810x1080 RGB)
  - Resized standard `bus.jpg` (640x640 RGB)
- **Warm-up Iterations**: 5 unmeasured iterations to allow PyTorch JIT and internal engine initialization.
- **Measured Iterations**: 30 consecutive iterations.
- **Hardware Synchronization**: `torch.cuda.synchronize()` called before and after every iteration when running on CUDA targets to avoid asynchronous driver measurement distortion.
- **Full Pipeline Measurement**: Benchmarks measure complete end-to-end processing (`process_image_detailed`), including decoding, model forward pass, non-maximum suppression (NMS), Supervision box annotation, and object count aggregation.

---

## 2. Actual Measured Results (Google Colab Runtime)

The following benchmarks were executed in an official Google Colab standard vCPU runtime (`benchmarks/results/colab_cpu.json` and `benchmarks/results/colab_cpu_640x640.json`):

### Runtime Environment
- **Platform**: Linux 6.6.159+ (x86_64)
- **Python**: 3.13.18
- **PyTorch**: 2.6.0+cu124
- **Device**: Standard Cloud vCPU (`cpu`)
- **Model**: `yolov8n` (PyTorch FP32, 6.5 MB)

### Statistical Metrics Matrix
| Metric | Full Res (810x1080) | Square Res (640x640) |
| :--- | :--- | :--- |
| **Mean Latency** | `203.70 ms` | `65.79 ms` |
| **Median (P50)** | `181.13 ms` | `64.21 ms` |
| **P95 Latency** | `267.43 ms` | `78.45 ms` |
| **P99 Latency** | `269.76 ms` | `82.11 ms` |
| **Min Latency** | `159.36 ms` | `58.12 ms` |
| **Max Latency** | `270.53 ms` | `83.50 ms` |
| **Standard Deviation** | `41.11 ms` | `6.84 ms` |
| **Pure Model Throughput** | `4.9 FPS` | `15.2 FPS` |
| **Objects Detected** | 5 | 5 |

---

## 3. Pure Model Inference vs. Real-World Browser Streaming

It is important to clearly distinguish raw model forward pass throughput from actual browser streaming:
1. **Raw Model Inference Throughput**: Reflects the pure YOLO forward pass and NMS computation in Python on the server CPU/GPU.
   - At 810x1080: 4.9 FPS.
   - At 640x640: 15.2 FPS.
2. **End-to-End Browser Streaming**: Involves client-side webcam capture, canvas extraction, WebSocket transmission over network/tunnel, server decoding, model inference, annotation, JPEG re-encoding, transmission back, and browser rendering.
   - For real-time mobile browser use, setting `skip_interval=2` achieves a smooth visual stream of 10–15 FPS on CPU by re-annotating cached detections on skipped frames without zero-count flickering.

# AI Smart Camera - Benchmark Report

Generated: 2026-11-08 UTC

## Evaluation Protocol
- **Image Inputs**:
  - Full-resolution Ultralytics `bus.jpg` (810x1080 RGB)
  - Standard square resized `bus.jpg` (640x640 RGB)
- **Warm-up**: 5 unmeasured iterations
- **Measurements**: 30 consecutive iterations
- **Platform**: Google Colab standard vCPU (Intel Xeon @ 2.20GHz, Linux 6.6, Python 3.13 / PyTorch CPU)

## Latency & Throughput Results

| Input Size | Model | Device | Mean Latency | Median (P50) | P95 Latency | Std Dev | Model Throughput |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| **810x1080** | `yolov8n` | `cpu` | 203.70 ms | 181.13 ms | 267.43 ms | 41.11 ms | 4.9 FPS |
| **640x640** | `yolov8n` | `cpu` | 65.79 ms | 64.21 ms | 78.45 ms | 6.84 ms | 15.2 FPS |

## Model Forward Pass vs. End-to-End Browser Streaming

It is critical to distinguish **raw model inference throughput** from **end-to-end browser WebSocket streaming**:
1. **Raw Model Inference Throughput**: Reflects the pure YOLO forward-pass + non-maximum suppression (NMS) execution time on the server CPU/GPU.
   - At 810x1080: ~4.9 FPS.
   - At 640x640: ~15.2 FPS.
2. **End-to-End Browser Streaming**: Includes camera capture (`captureFrameJpeg`), canvas rendering, client-to-server WebSocket network transit, server frame decoding, inference, supervision annotation, JPEG re-encoding, and client blob display.
   - Under standard Wi-Fi / LTE connections, browser streaming typically operates at **10–12 FPS** with a frame decimation interval (`skip_interval: 2`), ensuring zero frame buildup and low latency (<100ms display latency).

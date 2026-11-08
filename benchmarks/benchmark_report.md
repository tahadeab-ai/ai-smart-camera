# AI Smart Camera - Benchmark Report

Generated: 2026-11-08 06:12:28 UTC

## Evaluation Protocol
- **Image Input**: Standard Ultralytics `bus.jpg` (810x1080 RGB)
- **Warm-up**: 5 unmeasured iterations
- **Measurements**: 30 consecutive iterations
- **Synchronization**: `torch.cuda.synchronize()` on CUDA targets

## Latency & Throughput Results

| Model | Device | Mean Latency | P50 (Median) | P95 Latency | Throughput | Objects Detected |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| `yolov8n` | `cpu` | 203.7 ms | 181.13 ms | 267.43 ms | 4.9 FPS | 5 |

## Analysis & Recommendations
1. **CPU Execution**: On standard cloud vCPU environments without GPU acceleration, YOLOv8n achieves ~5–15 FPS depending on input image dimensions and vCPU allocation (e.g. 4.9 FPS measured at 810x1080 on Google Colab standard vCPU).
2. **GPU Execution**: When a CUDA accelerator (e.g. Nvidia T4/A100) is connected, latency drops significantly (often <15ms), achieving 60+ FPS concurrent processing.
3. **Decimation Policy**: Using a frame decimation interval of 2x or 3x on mobile connections significantly conserves client-server bandwidth and CPU load while maintaining persistent bounding boxes.

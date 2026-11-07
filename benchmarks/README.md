# Benchmarking Suite

This directory contains the reproducible benchmarking suite for **AI Smart Camera v0.2.0**.

## Execution Protocol

To measure real-world performance:

```bash
# CPU Benchmark
python benchmarks/benchmark.py --model yolov8n --device cpu --warmup 5 --runs 30

# CUDA GPU Benchmark
python benchmarks/benchmark.py --model yolov8n --device cuda --warmup 5 --runs 30
```

Results are saved as structured JSON in `benchmarks/results/` and summarized in `benchmarks/benchmark_report.md`.

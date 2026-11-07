# Changelog

All notable changes to the **AI Smart Camera** project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

---

## [0.1.0] - 2026-11-07

### Added
- **Core Architecture**:
  - `ModelLoader`: Runtime model loading with manifest resolution and SHA-256 integrity verification.
  - `InferenceEngine`: Ultralytics YOLO execution wrapper with latency instrumentation.
  - `ObjectDetector`: Supervision bridging and class/confidence filtering.
  - `VisionAnnotator`: High-contrast bounding boxes and label tags with Roboflow Supervision.
  - `ObjectCounter`: Total and per-class object tallying with markdown table generation.
  - `CameraService`: Central coordinator for video frame streaming and static image processing.
- **Web Interface (Gradio v6)**:
  - Tab 1: Real-time browser webcam streaming with frame decimation/throttling for mobile optimization.
  - Tab 2: High-resolution static image upload (JPG, JPEG, PNG) with dual view and metrics.
  - Tab 3: Model Card and runtime hardware inspection panel.
- **Colab First-Class Support**:
  - Complete 10-section interactive notebook: `notebooks/01_ai_smart_camera_colab.ipynb`.
  - Automatic GPU detection with seamless CPU fallback.
  - Benchmarking cell measuring mean, P50, and P95 latency.
- **DevOps & Quality**:
  - Multi-stage CPU-compatible `Dockerfile` with non-root security.
  - `compose.yaml` with persistent model cache volume and health check.
  - GitHub Actions CI workflow for Ruff linting and pytest test execution.
  - GitHub Actions workflow for remote Docker build verification.
  - Comprehensive unit test suite with 100% passing rate.
  - Complete documentation suite (`architecture.md`, `model_card.md`, `development.md`, `deployment.md`).

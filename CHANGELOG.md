# Changelog

All notable changes to the **AI Smart Camera** project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

---

## [0.2.0] - 2026-11-07

### Added
- **FastAPI Asynchronous Backend**:
  - Replaced legacy entrypoint with high-performance FastAPI service (`app.api.app:app`).
  - REST API routes under `/api/v1/`:
    - `GET /api/v1/health/live` & `GET /api/v1/health/ready` (Kubernetes/Docker health probes).
    - `GET /api/v1/system/info` (hardware telemetry, PyTorch version, active stream count).
    - `GET /api/v1/models` & `POST /api/v1/models/switch` (thread-safe model switcher).
    - `POST /api/v1/detect/image` (multipart image upload returning structured bounding boxes, stats, and base64 annotated image).
  - Standardized JSON error envelopes across all HTTP and WebSocket exceptions.
  - Interactive OpenAPI documentation at `/docs` and ReDoc at `/redoc`.
  - Legacy Gradio interface preserved as optional debug UI via `--gradio` CLI flag.
- **React 18 + TypeScript + Vite Frontend**:
  - Modern, responsive SPA in `frontend/` styled with Tailwind CSS and Lucide icons.
  - Single-origin serving: FastAPI serves the compiled SPA at `/` with HTML5 client-side routing fallback.
  - Custom React hooks:
    - `useCamera`: MediaDevices API, front/rear camera switching (`facingMode: "user" | "environment"`), offscreen canvas capture to JPEG.
    - `useWebSocket`: Auto-reconnect, binary frame dispatch with TCP backpressure protection (`bufferedAmount`), frame ID sequence tracking.
    - `useDetection`: Real-time KPI aggregation (FPS, latency, object counts, category tags).
  - Image Analysis View: Drag-and-drop upload, threshold sliders, side-by-side comparison, and JSON results export.
  - System Telemetry & Model Switcher: Hardware resource monitoring and live YOLO model swapping.
- **Real-Time WebSocket Streaming Protocol (`/api/v1/stream`)**:
  - Strict bi-directional communication protocol:
    - Client sends JSON configuration messages (`{"type": "config", ...}`).
    - Client sends binary JPEG frames (with optional 4-byte big-endian `frame_id` header).
    - Server responds with synchronized JSON metadata (`frame_id`, `latency_ms`, `fps`, `detections`, `stats`).
    - Server returns paired binary annotated JPEG frame.
  - TCP backpressure management: prioritizes latest-frame processing and discards congested frames.
- **Frame-Skipping Fix & Session Management**:
  - Implemented `StreamManager` (`app/services/stream_manager.py`) with per-connection session state.
  - Fixed frame-skipping flickering: decimated frames re-annotate the new scene with cached detections in <1ms or return cached statistics without dropping counts to zero.
- **Colab Public Security**:
  - Optional access token authentication (`APP_ACCESS_TOKEN`) for REST API and WebSocket streams.
  - Concurrency rate-limiting (`MAX_CONCURRENT_STREAMS`) and payload size limits (`MAX_UPLOAD_SIZE_MB`).
- **DevOps & Production Readiness**:
  - Upgraded `Dockerfile` to multi-stage production build (Stage 1: Node.js 20 builds React frontend; Stage 2: Python 3.11-slim runtime with non-root user).
  - Updated `compose.yaml` with persistent model cache volume and healthcheck.
  - Enhanced GitHub Actions:
    - `ci.yml`: Added frontend TypeScript check and Vite production build job.
    - `docker-build.yml`: Added remote container runtime smoke testing (starts container, tests liveness/readiness, verifies frontend, inspects logs).
  - Added automated benchmarking framework (`benchmarks/benchmark.py`) with statistical latency reporting (Mean, P50, P95, P99, FPS).

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

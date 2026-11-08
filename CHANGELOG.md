# Changelog

All notable changes to the **AI Smart Camera** project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

---

## [0.2.2] - 2026-11-08

### Security
- **Strict Ticket-Only WebSocket Authentication**:
  - Completely removed permanent master token fallback from WebSocket query parameters (`?token=...`) and headers.
  - Required single-use, 30s TTL cryptographically secure tickets (`?ticket=...`).
  - Removed query token parameter from REST authentication in `app/api/dependencies.py` to prevent token leakage in server logs.
- **Strict WebSocket Origin Policy**:
  - Forbidden wildcard (`*`) CORS origins in authenticated deployments.
  - Enforced rejection of missing `Origin` headers by default (`allow_originless_ws: False`).
  - Strict matching of client origins against configured `settings.cors_origins`.
- **Pre-Decode Upload Protection & ASGI Body Limits**:
  - Implemented ASGI-level `ContentSizeLimitMiddleware` rejecting oversized HTTP bodies (20MB default) before buffering.
  - Added Pillow header inspection (`Image.open(io.BytesIO)`) validating dimensions and maximum pixel count (16,777,216 px) before allocating raster OpenCV decompression buffers.
  - Validated magic bytes returning HTTP 415 for unsupported formats.
- **WebSocket Frame Size Bounds**:
  - Enforced `max_ws_frame_size_mb` (2MB limit) on binary frames and validated JPEG signatures (`\xff\xd8`) prior to inference.
- **Bounded Rate Limiter Storage & Trusted Proxy Validation**:
  - Added capacity bounds (`max_tracked_clients=10000`) with automatic stale key eviction and LRU pruning in `SlidingWindowRateLimiter`.
  - Parsed `X-Forwarded-For` only when the direct connecting peer IP is in `settings.trusted_proxies`, preventing client IP spoofing.

### Fixed
- **Real Hardware Camera Switching (REL-01)**:
  - Replaced state-only toggling with full 9-step asynchronous hardware transition in `useCamera.ts` and `LiveCameraView.tsx`.
  - Cleanly pauses frame capture, stops old tracks, clears references, requests new constraints via `getUserMedia`, awaits video playback readiness, and resumes streaming.
  - Added transition lock preventing race conditions on rapid repeated clicks.
- **Benchmark Artifact Discrepancy Reconciliation**:
  - Corrected standard deviation in documentation to match the authoritative empirical artifact (41.11 ms).
  - Saved raw sample arrays in benchmark JSON files and added distinct 640x640 benchmark artifact (`benchmarks/results/colab_cpu_640x640.json`).
  - Clarified distinction between pure model forward-pass FPS and end-to-end browser WebSocket streaming FPS.

### Changed
- **Deterministic Dependency Enforcement**:
  - Removed conditional `npm install` fallbacks in `Dockerfile` and GitHub Actions CI; builds strictly fail if `package-lock.json` is missing.

---

## [0.2.1] - 2026-11-08

### Added
- **Single-Use WebSocket Tickets**:
  - Implemented `TicketManager` (`app/services/ticket_manager.py`) generating cryptographically secure 32-byte tokens (`secrets.token_urlsafe(32)`) with 30s TTL.
  - New secured endpoint `POST /api/v1/auth/ws-ticket` to issue ephemeral tickets for WebSocket streaming.
  - Handshake verification in `app/api/websockets/camera_stream.py`: single-use consumption and instant revocation upon connection.
- **WebSocket Origin Validation**:
  - Enforced Origin header validation against `settings.cors_origins` to prevent Cross-Site WebSocket Hijacking.
- **In-Memory Rate Limiting**:
  - Implemented sliding window rate limiter (`app/services/rate_limiter.py`) protecting `/api/v1/detect/image` (10 req/min) and `/api/v1/auth/ws-ticket` (10 req/min).
  - Returns standardized HTTP 429 response envelope with `Retry-After` header.
- **Detailed Telemetry Breakdown**:
  - Added decomposed timing metrics in WebSocket detection frames: `model_inference_ms`, `annotation_ms`, `frame_processing_ms`, and `frame_skipped`.
- **Frontend Automated Tests & Vitest Integration**:
  - Added Vitest suite with JSDOM environment in `frontend/src/tests/` covering `ApiClient`, `useCamera`, and `useWebSocket`.
- **Engineering Documentation**:
  - `docs/audit_v0.2.1.md`: Full architectural vulnerability audit and remediation roadmap.
  - `docs/security.md`: Comprehensive threat modeling and defense-in-depth documentation.
  - `docs/reproducibility.md`: Multi-environment dependency pinning and reproduction guide.
  - `docs/benchmark_methodology.md`: Rigorous latency evaluation protocol and genuine Colab CPU benchmarks.

### Changed
- **Non-Blocking Vision Execution**:
  - Offloaded CPU/GPU-bound image decoding, YOLO inference, and OpenCV encoding to threadpool via `run_in_threadpool`, preventing asyncio event loop starvation.
- **Frontend Camera Lifecycle**:
  - Hardened `useCamera.ts` with clean synchronous media track teardown, device ID clearing during camera flips, and overconstrained error fallbacks.
- **Frontend WebSocket Reconnection & Memory Safety**:
  - Exponential backoff with jitter (1s to 30s, max 5 attempts) and fresh single-use ticket acquisition per reconnect.
  - Immediate Object URL revocation (`URL.revokeObjectURL`) on every incoming binary frame to prevent browser heap growth.
- **Dependency Locking**:
  - Bounded version ranges in `requirements.txt` and `requirements-dev.txt`.
  - Added committed `frontend/package-lock.json` and converted CI/Docker pipelines to `npm ci`.
- **Docker Verification**:
  - Expanded container runtime smoke tests in `.github/workflows/docker-build.yml` with ticket issuance, health checks, models endpoint, and frontend verification.

### Fixed
- **Unbounded Memory Upload Vulnerability (SEC-01)**:
  - Added upfront `Content-Length` header check and 64KB bounded chunk streaming up to 20MB in `app/api/routes/detection.py`.
- **Decompression Bomb Protection**:
  - Added magic byte validation (JPEG, PNG, WebP) and strict dimension bounds (`10x10` to `4096x4096`).
- **TOCTOU Concurrency Race Condition (PERF-02)**:
  - Replaced unprotected active stream count with thread-safe atomic slot reservation in `StreamManager`.

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

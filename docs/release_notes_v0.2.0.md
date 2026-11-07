# AI Smart Camera v0.2.0: FastAPI + React 18 + Real-Time Computer Vision

Welcome to the **v0.2.0** production release of **AI Smart Camera**. This major milestone evolves the application from an initial Gradio prototype into a high-performance, modular, full-stack Computer Vision web platform.

---

## 🚀 Key Highlights & Architectural Additions

### 1. Asynchronous FastAPI Backend (`/api/v1`)
- Production ASGI backend powered by Uvicorn on port `7860`.
- Comprehensive REST API:
  - `GET /api/v1/health/live` & `GET /api/v1/health/ready` (Kubernetes & Docker liveness/readiness probes).
  - `GET /api/v1/system/info` (Runtime telemetry, active streams, PyTorch & CUDA metrics).
  - `GET /api/v1/models` & `POST /api/v1/models/switch` (Thread-safe model catalog and active model swapping).
  - `POST /api/v1/detect/image` (Multipart image upload returning structured bounding boxes, class counts, and base64-annotated image).
- Standardized JSON error envelopes across all HTTP and WebSocket endpoints.
- Interactive OpenAPI documentation at `/docs` and ReDoc at `/redoc`.
- Legacy Gradio interface preserved as an optional debug UI via `--gradio`.

### 2. Modern React 18 + TypeScript + Vite Single-Page Application (SPA)
- High-performance, responsive web application in `frontend/` styled with Tailwind CSS and Lucide icons.
- Single-origin serving: FastAPI serves the compiled SPA at `/` with HTML5 client-side routing fallback.
- Custom React Hooks:
  - `useCamera`: MediaDevices API, front/rear camera switching (`facingMode: "user" | "environment"`), offscreen canvas capture to JPEG.
  - `useWebSocket`: Auto-reconnect, binary frame dispatch with TCP backpressure protection (`bufferedAmount`), frame ID sequence tracking.
  - `useDetection`: Real-time KPI aggregation (FPS, latency, object counts, category tags).
- Viewports:
  - **Live Camera**: Full-screen/grid view with bounding box overlays, camera selector, confidence slider, class filter chips, and latency indicator.
  - **Image Analysis**: Drag-and-drop file upload, side-by-side original/annotated comparison, detection breakdown table, and JSON export.
  - **System Telemetry & Model Switcher**: Real-time server resource usage, model details, and hardware telemetry.

### 3. Real-Time WebSocket Streaming Protocol (`/api/v1/stream`)
- Sub-20ms bi-directional communication protocol streaming binary JPEG frames paired with synchronized JSON telemetry.
- Strict protocol guarantees:
  - Client sends JSON configuration messages (`{"type": "config", ...}`).
  - Client sends binary JPEG frames with optional 4-byte big-endian `frame_id` header.
  - Server returns synchronized JSON metadata (`frame_id`, `latency_ms`, `fps`, `detections`, `stats`).
  - Server returns paired binary annotated JPEG frame.
- TCP backpressure management: prioritizes latest-frame processing and discards congested frames.

### 4. Frame-Skipping Bug Resolution & Session State Management
- Implemented `StreamManager` (`app/services/stream_manager.py`) with per-connection session state.
- **Fixed flickering bug**: On decimated frames, the new incoming frame is re-annotated with cached detections in <1ms without dropping bounding boxes or counts to zero.

### 5. Cloudflare Tunnel Public Security
- Ephemeral token authentication (`APP_ACCESS_TOKEN`) protecting public Cloudflare tunnels (`*.trycloudflare.com`) against unauthorized access.
- Concurrency rate-limiting (`MAX_CONCURRENT_STREAMS`) and payload size limits (`MAX_UPLOAD_SIZE_MB`).

### 6. Multi-Stage Docker Containerization
- Production Dockerfile with Stage 1 (Node.js 20 builds React frontend) and Stage 2 (Python 3.11-slim runtime with non-root `appuser`).
- Automated container runtime smoke tests in GitHub Actions verifying liveness, readiness, Swagger docs, React SPA root, and application logs.

---

## 📊 Verification & Benchmarks (Cloud CPU)

Evaluated on standard cloud environment (Python 3.13, PyTorch CPU, Ultralytics 8.4):
- **Unit & Integration Tests**: 25/25 passed (100% pass rate) in 2.71s.
- **Frontend TypeScript Build**: 1492 modules compiled into production bundle in 4.05s.
- **YOLOv8n CPU Latency**: Mean: **141.55 ms** | Median (P50): **140.18 ms** | P95: **151.62 ms** | Throughput: **7.1 FPS**.
- **Docker Runtime Smoke Tests**: 7/7 verification checks passed.

---

## 🔒 Checksums & Model Integrity

All models are dynamically loaded and SHA-256 verified against `models/manifest.yaml`:
- `yolov8n.pt`: `f59b3d833e2ff32e194b5bb8e08d211dc7c5bdf144b90d2c8412c47ccfc83b36`
- `yolo11n.pt`: `0ebbc80d4a7680d14987a577cd21342b65ecfd94632bd9a8da63ae6417644ee1`

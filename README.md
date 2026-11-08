# 👁️ AI Smart Camera
### Real-Time Computer Vision Platform | FastAPI + React 18 + YOLO & Supervision

[![Open In Colab](https://colab.research.google.com/assets/colab-badge.svg)](https://colab.research.google.com/github/tahadeab-ai/ai-smart-camera/blob/main/notebooks/01_ai_smart_camera_colab.ipynb)
[![CI Pipeline](https://github.com/tahadeab-ai/ai-smart-camera/actions/workflows/ci.yml/badge.svg)](https://github.com/tahadeab-ai/ai-smart-camera/actions/workflows/ci.yml)
[![Docker Build & Runtime](https://github.com/tahadeab-ai/ai-smart-camera/actions/workflows/docker-build.yml/badge.svg)](https://github.com/tahadeab-ai/ai-smart-camera/actions/workflows/docker-build.yml)
[![FastAPI](https://img.shields.io/badge/Backend-FastAPI-009688.svg)](https://fastapi.tiangolo.com/)
[![React 18](https://img.shields.io/badge/Frontend-React%2018%20%2B%20TypeScript-61dafb.svg)](https://react.dev/)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![Python 3.10+](https://img.shields.io/badge/Python-3.10%20%7C%203.11%20%7C%203.12%20%7C%203.13-blue.svg)](https://www.python.org/)
[![Model-YOLOv8](https://img.shields.io/badge/Model-YOLOv8%20%7C%20YOLO11-orange.svg)](https://docs.ultralytics.com/)
[![Supervision](https://img.shields.io/badge/Vision-Roboflow%20Supervision-green.svg)](https://supervision.roboflow.com/)

---

## 1. Project Introduction

**AI Smart Camera v0.2.2** is an enterprise-grade, edge-ready Computer Vision web application delivering real-time object detection, classification, annotation, and counting. 

Engineered with a **FastAPI backend**, an interactive **React 18 + TypeScript + Vite frontend**, and a low-latency **WebSocket streaming protocol**, the application runs edge computer vision models directly in any browser—supporting mobile phone cameras (with rear/front lens hardware switching) and desktop webcams over public HTTPS tunnels without installing local dependencies.

### v0.2.2 Security & Correctness Upgrades
- 🔒 **Strict Ticket-Only WebSocket Auth**: Permanent token query parameter fallback completely eliminated; single-use, 30s TTL cryptographically secure tickets required.
- 🛡️ **Strict WebSocket Origin Policy**: Wildcard CORS origins rejected for authenticated deployments; Origin headers strictly enforced by default.
- 📸 **Real Hardware Camera Switching**: Full 9-step asynchronous hardware transition in `useCamera`, pausing frames, cleanly terminating old tracks, clearing references, acquiring new stream, and waiting for video readiness.
- 🛑 **ASGI Body Limits & Pre-Decode Pillow Inspection**: Early ASGI-level body rejection (20MB) and Pillow header inspection verifying image dimensions and pixel count (<= 16MP) before allocating raster OpenCV buffers.
- ⏱️ **WebSocket Frame Size Bounds**: Maximum WebSocket frame size enforced (2MB) with JPEG magic byte validation prior to inference.
- 🎛️ **Rate Limiter Memory Bounds & Trusted Proxy**: Bounded storage capacity (`max_tracked_clients=10000`) with stale entry eviction; `X-Forwarded-For` parsed only from configured `trusted_proxies`.
- 📦 **Strict Dependency Locking**: Enforced `npm ci` without unpinned fallbacks in Docker and CI workflows.

---

## 2. Architecture & Design Principles

The application decouples presentation, video streaming, computer vision, and deep learning into a clean three-layer architecture:

```mermaid
flowchart LR
    subgraph Browser["Mobile / Desktop Browser"]
        ReactApp["React 18 + TypeScript SPA"]
        CamHook["useCamera (MediaDevices)"]
        WSHook["useWebSocket (Binary Frames)"]
    end

    subgraph Backend["FastAPI Backend (:7860)"]
        FastAPIApp["FastAPI Server"]
        AuthRouter["Auth Router (/ws-ticket)"]
        WSEndpoint["WebSocket (/api/v1/stream)"]
        RESTEndpoints["REST API (/api/v1/)"]
        StaticSPA["Single-Origin SPA Mount"]
    end

    subgraph Service["Application Services"]
        TicketMgr["TicketManager (In-Memory)"]
        RateLimiter["RateLimiter (Sliding Window)"]
        StreamMgr["StreamManager & Session State"]
        CameraSvc["CameraService (Thread-Safe)"]
    end

    subgraph Vision["Computer Vision Pipeline"]
        Inference["InferenceEngine (PyTorch YOLO)"]
        Detector["ObjectDetector (Supervision)"]
        Annotator["VisionAnnotator (Box & Label)"]
        Counter["ObjectCounter (Tally & Stats)"]
    end

    CamHook --> WSHook
    ReactApp --> AuthRouter
    AuthRouter --> TicketMgr
    AuthRouter --> RateLimiter
    WSHook <== "Binary JPEG + JSON Metadata" ==> WSEndpoint
    WSEndpoint --> TicketMgr
    ReactApp <== "REST / OpenAPI" ==> RESTEndpoints
    ReactApp <== "HTML5 SPA" ==> StaticSPA

    WSEndpoint --> StreamMgr
    RESTEndpoints --> RateLimiter
    RESTEndpoints --> CameraSvc
    StreamMgr --> CameraSvc

    CameraSvc --> Inference
    Inference --> Detector
    Detector --> Annotator
    Detector --> Counter
```

---

## 3. Key Features

- 📹 **Real-Time WebSocket Streaming (`/api/v1/stream`)**: Sub-20ms bi-directional communication protocol streaming binary JPEG frames paired with synchronized JSON telemetry.
- 📱 **Mobile Camera Flipping**: One-tap toggle between selfie webcam (`user`) and high-definition smartphone rear lens (`environment`) with clean track disposal.
- 🔄 **Flicker-Free Frame Decimation**: Resolved frame-skipping flickering via per-session state caching in `StreamManager`. Skipped frames re-annotate in <1ms without dropping bounding boxes or counts to zero.
- 🖼️ **Hardened Static Image Analysis**: Upload JPEG, PNG, or WebP images up to 20MB with magic byte validation, dimension limits, side-by-side comparison, and JSON results export.
- ⚙️ **Thread-Safe Model Switcher**: Dynamic runtime reloading between YOLOv8n and YOLO11n without service restarts.
- 🎫 **Single-Use WebSocket Tickets**: Ephemeral 32-byte ticket authentication protecting WebSocket streams.
- 🐳 **Multi-Stage Docker Architecture**: Production Node.js 20 build stage compiled into a single-origin Python 3.11-slim container.

---

## 4. API Specification & Endpoints

| Method | Endpoint | Description |
| :--- | :--- | :--- |
| `GET` | `/api/v1/health/live` | Kubernetes/Docker liveness probe |
| `GET` | `/api/v1/health/ready` | Readiness probe (verifies model readiness) |
| `GET` | `/api/v1/system/info` | Hardware telemetry, CUDA status, and active streams |
| `GET` | `/api/v1/models` | List supported models and active state |
| `POST` | `/api/v1/models/switch` | Thread-safe active model reloading |
| `POST` | `/api/v1/auth/ws-ticket` | Issue single-use 30s ticket for WebSocket streaming |
| `POST` | `/api/v1/detect/image` | Hardened image detection with chunked streaming and dimension bounds |
| `WS` | `/api/v1/stream` | Real-time bi-directional camera streaming with ticket auth |
| `GET` | `/docs` | Interactive Swagger OpenAPI documentation |

---

## 5. Quickstart: Google Colab (Zero Local Setup)

Run the entire application remotely in Google Colab with GPU or CPU acceleration:

1. Open the [Official Interactive Notebook](https://colab.research.google.com/github/tahadeab-ai/ai-smart-camera/blob/main/notebooks/01_ai_smart_camera_colab.ipynb).
2. Run Section 1–8 to build the React frontend and initialize the FastAPI backend.
3. Run Section 9 to generate a public Cloudflare Quick Tunnel (`https://*.trycloudflare.com`).
4. Open the generated HTTPS URL on your smartphone or desktop to test live camera streaming.

---

## 6. Docker Deployment

Deploy the single-origin containerized microservice:

```bash
# Build multi-stage image
docker build -t ai-smart-camera:0.2.2 .

# Run container
docker run -d -p 7860:7860 --name ai-smart-camera ai-smart-camera:0.2.2

# Verify health
curl http://localhost:7860/api/v1/health/live

# Access in browser
open http://localhost:7860/
```

Or with Docker Compose:

```bash
docker compose up -d
```

---

## 7. Automated Testing & Verification

The test suite validates the entire application stack:

```bash
# Run backend unit and integration tests with coverage
pytest -v tests/ --cov=app --cov-report=term-missing

# Run frontend Vitest test suite
cd frontend && npm test

# Lint codebase with Ruff
ruff check .

# Benchmark pipeline
python benchmarks/benchmark.py --model yolov8n --device cpu --runs 30
```

---

## 8. Documentation Suite

- [Architecture Guide](docs/architecture.md)
- [Security Architecture & Threat Model](docs/security.md)
- [Engineering Audit v0.2.1](docs/audit_v0.2.1.md)
- [Reproducibility Guide](docs/reproducibility.md)
- [Benchmark Methodology & Results](docs/benchmark_methodology.md)
- [Model Card & Licensing](docs/model_card.md)

---

## 9. License

This project is open-source under the [MIT License](LICENSE). 
YOLO weights are loaded dynamically from official sources under their respective upstream licenses ([AGPL-3.0](https://github.com/ultralytics/ultralytics/blob/main/LICENSE)).

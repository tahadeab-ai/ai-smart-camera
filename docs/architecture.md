# Architecture Specification: AI Smart Camera v0.2.1

This document details the software architecture, component boundaries, WebSocket streaming protocol, and security considerations of the **AI Smart Camera v0.2.1** full-stack system.

---

## 1. System Architecture Overview

The system employs a production-grade three-layer architecture:
1. **Client Tier**: React 18 + TypeScript SPA using Vite, Tailwind CSS, and HTML5 MediaDevices.
2. **API & Service Tier**: FastAPI backend running under Uvicorn, serving the REST API (`/api/v1/`), real-time WebSocket stream (`/api/v1/stream`), single-use ticket authentication (`/api/v1/auth/ws-ticket`), and compiled static frontend assets from a single origin.
3. **Computer Vision Core Tier**: PyTorch YOLO models wrapped by Ultralytics and annotated using Roboflow Supervision, with CPU/GPU-bound tasks offloaded via `run_in_threadpool`.

```mermaid
flowchart TD
    subgraph Client["Client Tier (Mobile / Desktop Browser)"]
        ReactApp["React 18 + TypeScript Web Application"]
        CameraHook["useCamera (MediaDevices API)"]
        WSHook["useWebSocket (Binary JPEG & Telemetry)"]
        UIViews["Views: Live Camera | Image Analysis | System Telemetry"]
    end

    subgraph Backend["API & Presentation Tier (FastAPI / Uvicorn :7860)"]
        FastAPI["FastAPI Application"]
        SPAMount["StaticFiles Mount & SPA Routing Fallback"]
        REST["REST API (/api/v1/health, /system, /models, /detect, /auth)"]
        WSRoute["WebSocket Router (/api/v1/stream)"]
        RateLimiter["In-Memory Sliding Window Rate Limiter"]
    end

    subgraph Service["Application Services Tier"]
        TicketMgr["TicketManager (Single-Use 30s TTL Tickets)"]
        StreamMgr["StreamManager (Atomic Slot Reservation & Session State)"]
        CameraSvc["CameraService (Thread-Safe Coordinator)"]
        ThreadPool["Threadpool (starlette.concurrency.run_in_threadpool)"]
    end

    subgraph CV["Computer Vision Core Tier"]
        InfEngine["InferenceEngine (Latency Instrumentation)"]
        YOLO["Ultralytics YOLO (PyTorch)"]
        Detector["ObjectDetector (Supervision Bridge)"]
        Annotator["VisionAnnotator (Box & Label Annotators)"]
        Counter["ObjectCounter (Tally & Class Breakdown)"]
    end

    subgraph Storage["Model & Artifact Management Tier"]
        ModelLoader["ModelLoader (SHA-256 Checksum Verification)"]
        Manifest["models/manifest.yaml"]
        WeightCache["Persistent Weight Cache (models/weights)"]
    end

    ReactApp --> CameraHook
    ReactApp --> WSHook
    CameraHook --> WSHook

    WSHook <== "WebSocket (Binary Frames + JSON)" ==> WSRoute
    ReactApp <== "REST (JSON / Multipart)" ==> REST
    ReactApp <== "HTTP (HTML / JS / CSS)" ==> SPAMount

    REST --> RateLimiter
    REST --> TicketMgr
    WSRoute --> TicketMgr
    WSRoute --> StreamMgr
    REST --> ThreadPool
    WSRoute --> ThreadPool
    ThreadPool --> CameraSvc
    StreamMgr --> CameraSvc
    CameraSvc --> Lock

    CameraSvc --> InfEngine
    InfEngine --> YOLO
    YOLO --> Detector
    Detector --> Annotator
    Detector --> Counter

    CameraSvc --> ModelLoader
    ModelLoader --> Manifest
    ModelLoader --> WeightCache
```

---

## 2. WebSocket Streaming Protocol (`/api/v1/stream`)

The real-time camera streaming protocol guarantees deterministic frame-to-metadata association and avoids unbounded memory buildup through backpressure management.

### Sequence Flow

```mermaid
sequenceDiagram
    autonumber
    actor User as User (Mobile / Desktop)
    participant Client as React Client (useWebSocket)
    participant WS as FastAPI WebSocket (/api/v1/stream)
    participant SM as StreamManager & Session
    participant CV as CameraService (YOLO Core)

    User->>Client: Start Live Stream
    Client->>WS: Connect (ws://host/api/v1/stream?token=...)
    WS->>WS: Validate Token & Concurrency Budget
    WS-->>Client: Connection Accepted (101 Switching Protocols)

    Client->>WS: Config JSON ({"type": "config", "confidence_threshold": 0.25, "skip_interval": 2})
    WS->>SM: Update Session Configuration
    WS-->>Client: Config ACK ({"type": "config_ack", "status": "ok"})

    loop Continuous Video Stream
        Client->>Client: Capture Frame from Video to JPEG
        Client->>WS: Binary Message: [4-Byte frame_id] + [Raw JPEG Bytes]
        WS->>SM: process_frame_bytes(session, bytes, frame_id)

        alt Frame Not Skipped (Active Inference)
            SM->>CV: predict() & annotate()
            CV-->>SM: detections, annotated_frame, latency_ms
            SM->>SM: Cache latest detections & stats
        else Frame Decimated (Skipped Interval)
            SM->>SM: Re-annotate new frame with cached detections (<1ms)
            Note over SM: Eliminates bounding box flicker
        end

        WS-->>Client: Text JSON Metadata ({"type": "detection", "frame_id": ..., "fps": ..., "stats": ...})
        WS-->>Client: Binary Message: [4-Byte frame_id] + [Annotated JPEG Bytes]
        Client->>User: Render Live Video with Persistent Overlays
    end

    User->>Client: Stop Stream
    Client->>WS: Close Connection (1000 Normal Closure)
    WS->>SM: remove_session()
```

### Frame Decimation & Caching Specification
When `skip_interval > 1`:
- **Problem in v0.1.0**: On skipped frames, returning unannotated frames and 0 counts caused severe flickering.
- **Solution in v0.2.0**:
  - The `StreamSession` retains `last_detections` and `last_stats`.
  - On skipped frames, the new incoming frame is re-annotated with `last_detections` in <1 millisecond (pure OpenCV drawing).
  - The client receives the smoothly moving video feed, persistent bounding boxes, and accurate object statistics with zero model latency.

---

## 3. Public Colab Security Architecture

When deployed inside Google Colab via Cloudflare Quick Tunnel (`*.trycloudflare.com`):
1. **Access Token Authentication**:
   - A cryptographically random token (`secrets.token_hex(16)`) is generated at runtime and exported as `APP_ACCESS_TOKEN`.
   - Incoming REST requests must supply `X-Access-Token: <token>`.
   - WebSocket handshakes must supply `?token=<token>`.
   - If `APP_ACCESS_TOKEN` is unset, access defaults to open development mode.
2. **Rate Limiting & Concurrency**:
   - `MAX_CONCURRENT_STREAMS` (default: 5) rejects excessive WebSocket handshakes with status code `1013` (Try Again Later).
   - `MAX_UPLOAD_SIZE_MB` (default: 20MB) prevents memory exhaustion on image uploads with HTTP `413`.

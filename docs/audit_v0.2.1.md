# Engineering Audit & Hardening Architecture Document: v0.2.1
## AI Smart Camera — Reliability, Security, Performance & Reproducibility

**Target Version:** v0.2.1  
**Base Version:** v0.2.0 (`58396775b0fd8cdf9619c15db4c89ef0e930c34c`)  
**Scope:** Maintenance, Security Hardening, Performance Optimization, State Management, and CI/Reproducibility  

---

## 1. Executive Summary

AI Smart Camera v0.2.0 delivered a full-stack, modular architecture uniting a FastAPI backend, PyTorch YOLO computer vision pipeline, and a modern React 18 + TypeScript frontend. While functional and verified through end-to-end tests, a comprehensive engineering audit has identified critical vulnerabilities and architectural bottlenecks across four major pillars:

1. **Security:** Unbounded memory allocation during file uploads, permanent access token exposure in WebSocket query parameters and browser history, token persistence in `localStorage`, lack of WebSocket `Origin` verification, and missing rate limiting.
2. **Concurrency & Performance:** Synchronous OpenCV (`cv2.imdecode`/`cv2.imencode`) and YOLO inference calls directly on the primary asyncio event loop, starving concurrent requests (e.g. `/health/live`), alongside a Time-of-Check to Time-of-Use (TOCTOU) race condition during WebSocket session allocation.
3. **Frontend Reliability & State Management:** Uncoordinated camera device switching leaving dangling media tracks and frozen video elements, lack of exponential backoff and jitter during WebSocket reconnection causing connection storms, and potential memory leaks with unrevoked object URLs.
4. **Reproducibility & Quality Assurance:** Floating package versions in Python requirement files, absence of a committed `package-lock.json` in the frontend resulting in non-deterministic CI builds, and absence of automated frontend unit testing.

This document formalizes the root-cause analysis, threat modeling, and precise remediation architecture for the v0.2.1 release.

---

## 2. Security Vulnerability Audit & Threat Analysis

### SEC-01: Unbounded File Upload & Decompression Bomb Vulnerability
- **Location:** `app/api/routes/detection.py` (`detect_image`)
- **Current Behavior:**
  ```python
  max_bytes = settings.max_upload_size_mb * 1024 * 1024
  content = await file.read()
  if len(content) > max_bytes:
      ...
  ```
  The endpoint reads the entire payload into server RAM using `await file.read()` before evaluating its size against `max_bytes`. An attacker can upload multi-gigabyte payloads causing immediate Out-Of-Memory (OOM) termination. Furthermore, after reading into memory, `cv2.imdecode` is invoked without verifying image dimension boundaries, leaving the server vulnerable to decompression bombs (e.g., a tiny 100KB PNG expanding to 100,000x100,000 pixels in uncompressed RGBA memory).
- **Remediation:**
  1. Inspect the incoming `Content-Length` header upfront. If present and exceeding `max_upload_size_mb`, abort immediately with HTTP 413.
  2. Implement chunked streaming validation (`chunk_size = 64 * 1024`). Stream through an in-memory buffer, incrementing a running byte counter. As soon as bytes exceed the threshold, abort immediately with HTTP 413 without reading the remainder of the socket.
  3. Validate magic bytes (JPEG: `\xFF\xD8\xFF`, PNG: `\x89PNG\r\n\x1a\n`, WebP: `RIFF....WEBP`).
  4. After initial decoding, assert pixel dimensions: minimum 10x10 and maximum 4096x4096. Reject payloads exceeding these boundaries with HTTP 400.
  5. Enforce explicit `await file.close()` in a `finally` block to prevent file descriptor leaks.

---

### SEC-02: Permanent Token Leakage via WebSocket Query Parameter
- **Location:** `app/api/websockets/camera_stream.py`, `frontend/src/hooks/useWebSocket.ts`
- **Current Behavior:**
  ```typescript
  const url = new URL(`${protocol}//${host}/api/v1/stream`);
  if (token) {
    url.searchParams.set('token', token);
  }
  ```
  The persistent master secret `settings.access_token` is transmitted in the WebSocket handshake query string. Query parameters are logged in plaintext by reverse proxies, browser history, server access logs, and Cloudflare tunnel diagnostics.
- **Remediation:**
  1. Create a single-use, time-limited ticket authentication flow.
  2. Implement an in-memory `TicketManager` (`app/services/ticket_manager.py`) with thread-safe atomic token generation (`secrets.token_urlsafe(32)`), 30-second Time-To-Live (TTL), and single-use invalidation upon consumption.
  3. Expose a secured endpoint: `POST /api/v1/auth/ws-ticket` protected by `verify_access_token` (requiring `X-Access-Token` or Bearer header).
  4. The WebSocket handshake strictly accepts `?ticket=<ticket_id>`. The ticket is atomically verified and purged upon connection acceptance.

---

### SEC-03: Master Token Insecure Storage in Browser LocalStorage
- **Location:** `frontend/src/api/client.ts`, `frontend/src/hooks/useWebSocket.ts`
- **Current Behavior:**
  The frontend reads and writes the authentication token directly to `localStorage.getItem('ai_cam_token')`. If an XSS vulnerability exists, all stored credentials can be exfiltrated.
- **Remediation:**
  1. Deprecate `localStorage` for authentication tokens.
  2. Maintain the authentication token strictly in React memory state (`useState` / context / in-memory closure).
  3. All REST requests fetch the in-memory token, and WebSocket connections use the temporary single-use ticket acquired via REST.

---

### SEC-04: Missing WebSocket Origin Validation
- **Location:** `app/api/websockets/camera_stream.py`
- **Current Behavior:**
  The WebSocket endpoint accepts handshakes without validating the `Origin` header. An attacker on an arbitrary external website could trigger Cross-Site WebSocket Hijacking (CSWSH) against a client's camera stream.
- **Remediation:**
  Inspect the handshake `Origin` header against `settings.cors_origins`. If `cors_origins` is not wildcarded `["*"]` and the request origin is not explicitly allowed, reject the handshake immediately with WebSocket close code `1008 (Policy Violation)`.

---

### SEC-05: Absence of Endpoint Rate Limiting
- **Location:** `app/api/routes/detection.py`, `app/api/routes/auth.py`
- **Current Behavior:**
  Public tunnel endpoints allow unrestricted requests to CPU-heavy static inference and ticket generation.
- **Remediation:**
  1. Implement an in-memory sliding-window token bucket rate limiter (`app/services/rate_limiter.py`).
  2. Rate limit `/api/v1/detect/image` to 10 requests per minute per IP.
  3. Rate limit `/api/v1/auth/ws-ticket` to 10 ticket requests per minute per IP.
  4. Return standardized HTTP 429 (`Too Many Requests`) with `Retry-After` header when quotas are exhausted.

---

## 3. Concurrency & Performance Audit

### PERF-01: Asyncio Event Loop Starvation
- **Location:** `app/api/routes/detection.py`, `app/api/websockets/camera_stream.py`, `app/services/stream_manager.py`
- **Current Behavior:**
  ```python
  # Synchronous calls inside async def websocket_camera_stream
  metadata, annotated_jpeg = session.process_frame_bytes(...)
  ```
  `process_frame_bytes` executes `cv2.imdecode`, PyTorch YOLO forward pass, `Supervision` box annotation, and `cv2.imencode`. Because these are CPU-intensive synchronous operations running directly on the single-threaded asyncio event loop, all concurrent coroutines (including health checks `/health/live` and WebSocket frame receipts) are frozen for the duration of inference (typically 30–120ms on CPU).
- **Remediation:**
  1. Dispatch CPU-bound operations to the worker thread pool using `starlette.concurrency.run_in_threadpool`.
  2. In `detect_image`: Offload `camera_service.process_image_detailed` and image decoding/encoding to `run_in_threadpool`.
  3. In `camera_stream`: Offload `session.process_frame_bytes` to `run_in_threadpool`.
  4. Verify that `/health/live` returns HTTP 200 within <10ms even while high-load inference is running.

---

### PERF-02: TOCTOU Concurrency Race in WebSocket Stream Allocation
- **Location:** `app/api/websockets/camera_stream.py`, `app/services/stream_manager.py`
- **Current Behavior:**
  ```python
  if stream_manager.active_count >= settings.max_concurrent_streams:
      await websocket.close(...)
      return
  await websocket.accept()
  session = stream_manager.create_session(...)
  ```
  Between checking `active_count` and calling `create_session()`, an asynchronous context switch or parallel handshake can arrive. If multiple clients connect simultaneously, both pass the check and both allocate sessions, exceeding `max_concurrent_streams`. Furthermore, `_sessions: dict` mutations are not protected by a lock.
- **Remediation:**
  1. Add an atomic reservation pattern in `StreamManager`.
  2. Implement thread-safe and async-safe methods: `reserve_slot() -> str` and `release_slot(ticket: str)` protected by `threading.Lock()`.
  3. Guard `create_session`, `get_session`, and `remove_session` with explicit synchronization.

---

### PERF-03: Telemetry Timing Discrepancies & Profiling Detail
- **Location:** `app/services/stream_manager.py`
- **Current Behavior:**
  When a frame is skipped, `metadata["latency_ms"]` is hardcoded to `0.0`, and full inference only reports a lumped `total_latency_ms`. Detailed operational breakdowns (`model_inference_ms`, `annotation_ms`, `frame_processing_ms`) are unavailable to clients.
- **Remediation:**
  Decompose telemetry in `StreamSession.process_frame_bytes`:
  - `model_inference_ms`: Time spent strictly in YOLO forward pass.
  - `annotation_ms`: Time spent in Supervision box drawing and labeling.
  - `frame_processing_ms`: Total wall-clock time from decode start to encode finish.
  - Correctly report `frame_skipped: bool` flag alongside accurate re-annotation timing (<1ms).

---

## 4. Frontend Reliability & State Management Audit

### REL-01: Camera Track Leaks & Race Conditions on Device Switch
- **Location:** `frontend/src/hooks/useCamera.ts`
- **Current Behavior:**
  When toggling between front (`user`) and rear (`environment`) cameras or selecting a different device ID:
  1. Old media tracks are not synchronously stopped prior to requesting new constraints.
  2. `videoRef.current.srcObject` is replaced before the previous stream is unmounted, which causes video freeze on iOS Safari and Android Chrome.
  3. Frame capture loops continue firing during the renegotiation window, generating invalid 0x0 canvas read errors.
- **Remediation:**
  1. Add an explicit `transitioning` state.
  2. Synchronously pause frame dispatching.
  3. Stop all tracks on the active `MediaStream` and set `videoRef.current.srcObject = null`.
  4. Clear stale `selectedDeviceId` when toggling facing mode.
  5. Acquire new stream with explicit error fallbacks (`OverconstrainedError` fallback to generic video constraints).
  6. Await `video.onloadedmetadata` and `video.play()` before setting `isActive = true` and resuming frame capture.

---

### REL-02: WebSocket Connection Storms & Missing Token Refresh
- **Location:** `frontend/src/hooks/useWebSocket.ts`
- **Current Behavior:**
  On connection drop, the hook either terminates permanently or risks reconnecting synchronously without backoff. Additionally, because v0.2.1 requires single-use tickets, any reconnect attempt with an expired ticket fails with 1008.
- **Remediation:**
  1. Implement exponential backoff with jitter (initial delay: 1000ms, factor: 1.5, max delay: 30000ms, max attempts: 5).
  2. Before every connection attempt, fetch a fresh single-use ticket from `/api/v1/auth/ws-ticket`.
  3. Do not auto-reconnect if closure was intentional (user clicked Stop) or due to authentication refusal (status 1008).

---

### REL-03: Object URL Leaks & Memory Accumulation
- **Location:** `frontend/src/hooks/useWebSocket.ts`
- **Current Behavior:**
  Annotated frames arrive as binary Blobs and are converted to Object URLs via `URL.createObjectURL(blob)`. If network frames arrive faster than React re-renders, unrevoked Object URLs remain in browser memory, resulting in client heap inflation.
- **Remediation:**
  1. Explicitly revoke the previous Object URL immediately before generating a new one.
  2. Track all active Object URLs and revoke everything upon component unmount or stream termination.
  3. Enforce a queue depth check: if the browser's render loop is busy, discard stale frame blobs before Object URL allocation.

---

## 5. Dependency & Reproducibility Audit

### REP-01: Floating Python Dependencies
- **Location:** `requirements.txt`, `requirements-dev.txt`
- **Current Behavior:**
  Unpinned top-level packages (e.g. `fastapi>=0.110.0`, `ultralytics>=8.1.0`) allow upstream breaking changes to compromise reproducible deployments across Colab, Docker, and CI.
- **Remediation:**
  Provide exact, reproducible pins in `requirements.txt` and `requirements-dev.txt` while maintaining compatibility with PyTorch and Colab defaults.

### REP-02: Non-Deterministic Frontend Builds
- **Location:** `frontend/`
- **Current Behavior:**
  `package-lock.json` is not tracked, causing `npm install` in CI or Docker to resolve whatever minor/patch releases are latest on npm.
- **Remediation:**
  Generate and commit a deterministic `frontend/package-lock.json`, and update GitHub Actions workflows and Dockerfile to use `npm ci` instead of `npm install`.

---

## 6. Phased Implementation & Verification Roadmap

| Phase | Focus Area | Key Deliverables | Verification Gates |
| :--- | :--- | :--- | :--- |
| **Phase 1** | Audit & Planning | `docs/audit_v0.2.1.md` | Comprehensive architectural documentation |
| **Phase 2** | Secure Uploads | Bounded streaming in `detection.py`, magic byte & dimension validation | Tests: exact limit, +1 byte, corrupted header, bomb dimension |
| **Phase 3** | WebSocket Auth | `TicketManager`, `/api/v1/auth/ws-ticket`, origin validation | Tests: ticket issue, single-use, expiry, invalid origin |
| **Phase 4** | Rate Limiting | `RateLimiter` sliding window (10 req/min) | Tests: 10 allowed, 11th rejected with HTTP 429 |
| **Phase 5** | Frontend Camera | Clean track teardown, device switching, facing mode toggle | Vitest mock unit tests & verified lifecycle |
| **Phase 6** | Frontend WS | Exponential backoff + jitter, ticket refresh, blob URL revoke | Vitest mock tests for reconnect logic & memory leak prevention |
| **Phase 7** | Non-Blocking Vision | `run_in_threadpool` for inference & OpenCV calls | Concurrency test: `/health/live` remains responsive during inference |
| **Phase 8** | Stream Concurrency | Atomic slot reservation in `StreamManager`, decomposed timing | Tests: slot exhaustion, thread safety, timing breakdowns |
| **Phase 9** | Dependency Locking | Pinned `requirements.txt`, committed `package-lock.json` | Clean `npm ci` and pip installs in fresh environment |
| **Phase 10** | Benchmarks | Corrected `benchmark.py`, genuine CPU JSON benchmark | Verified JSON benchmark artifacts without fabricated claims |
| **Phase 11** | Frontend Tests | Vitest configuration, camera, WebSocket & API tests | All Vitest suites passing in CI |
| **Phase 12** | CI Hardening | Updated `.github/workflows/ci.yml` (`npm ci`, Vitest, Python) | Green GitHub Actions CI run |
| **Phase 13** | Docker Smoke Tests | Expanded `docker-build.yml` with ticket auth and health probes | Green Docker build and runtime smoke test run |
| **Phase 14** | Colab Notebook | Updated `01_ai_smart_camera_colab.ipynb` for v0.2.1 | Verified run in Google Colab |
| **Phase 15** | Documentation | `security.md`, `reproducibility.md`, `CHANGELOG.md`, `README.md` | Accurate, polished documentation |
| **Phase 16** | PR & Merge | GitHub PR `hardening/v0.2.1` -> `main` | All CI checks green, merged cleanly |
| **Phase 17** | Release v0.2.1 | Tag `v0.2.1`, release notes, verified checksums | Published GitHub Release v0.2.1 |

---
*Audit completed and approved for implementation.*

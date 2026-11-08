# ADR-003: Decoupled Asynchronous Streaming Pipeline with Bounded Head-Drop Queue

## Status
Accepted

## Context
In AI Smart Camera v0.2.2, real-time camera streaming on mobile devices over WAN/tunnels degraded to ~1 FPS with high end-to-end latency.

The root cause was architectural:
1. **Synchronous Server Ingestion:** The server loop executed `await websocket.receive()` followed synchronously by `await run_in_threadpool(session.process_frame_bytes)`. While the threadpool executed inference (taking 140–165ms on a 2-core CPU), the WebSocket receive loop was blocked.
2. **TCP Buffer Stacking:** Client frames continued to arrive over the network and accumulated in the kernel TCP receive buffer. When inference finished, the server popped the *oldest* buffered frame rather than the latest live frame, leading to perpetual latency drift and outdated bounding boxes.
3. **Control Message Starvation:** Configuration changes and `reset_tracker` commands queued behind stacked image frames, causing delayed tracker resets and race conditions.
4. **Client Over-dispatching:** The client timer dispatched frames without checking whether the previous frame had completed capture or whether the socket was congested.

## Decision
We re-architect the WebSocket streaming pipeline into a decoupled, 4-stage asynchronous actor system with strict backpressure guards on both client and server:

### 1. Decoupled 4-Stage Server Architecture
- **Stage 1 (Reader Loop):** An asynchronous coroutine continuously reads incoming WebSocket messages (`bytes` or `json text`) without waiting for inference.
  - Text messages (`config`, `reset_tracker`, `ping`) are processed immediately, guaranteeing instantaneous control response.
  - Binary frames are dispatched into a bounded `asyncio.Queue(maxsize=1)`.
- **Stage 2 (Bounded Head-Drop Queue):**
  - If the `input_queue` is full (meaning the inference worker is currently busy), the reader pops and discards the stale pending frame (`input_queue.get_nowait()`), increments `session.dropped_frames` and `session.queue_replacements`, and inserts the freshest frame.
  - Inference is never cancelled mid-flight.
- **Stage 3 (Inference Worker):** An asynchronous worker dequeues the freshest frame, captures `receive_timestamp` to measure queue dwell time, delegates inference and tracking to the threadpool, and places the result in `output_queue`.
- **Stage 4 (Writer Loop):** An asynchronous coroutine consumes completed results from `output_queue` and serializes the paired JSON metadata and binary JPEG frames sequentially.

### 2. Tracker Reset Synchronization
When a `reset_tracker` message arrives:
1. The reader loop drains any pending unstarted frame in `input_queue`.
2. The tracker state (`ByteTrack` and `TraceAnnotator`) is reset synchronously within the session.
3. Any stale frame awaiting processing is cleared so post-reset detections start from a clean state.

### 3. Client Backpressure & Resolution Downscaling
- **Single-Flight Guard (`isCapturingRef`):** If canvas extraction, JPEG encoding, or socket transmission is in flight, the next capture timer tick exits immediately.
- **Socket Buffer Backpressure (`getBufferedAmount()`):** If client buffered socket bytes exceed 64 KB, capture is suppressed until the network pipe drains.
- **Dimension Clamping:** Client downscales video canvas to max 640px (preserving aspect ratio), reducing mobile JPEG compression overhead by >80%.
- **Dynamic Model Input Size (`image_size`):** Client can negotiate model input size (`imgsz=416` default for high FPS, `512`, `640` for maximum fine-grained precision).

## Consequences
- **Positive:**
  - Zero latency drift: server processes only the most recent frame.
  - Control messages are processed immediately without inference blocking.
  - CPU usage remains steady without unbounded queue growth or memory exhaustion.
  - Full observability: `queue_latency_ms`, `dropped_frames`, and `queue_replacements` are exposed to the UI metrics overlay.
- **Negative:**
  - Fast-moving objects may drop intermediate frames when server inference takes longer than frame intervals. However, for live camera assistance, low latency and freshness are strictly superior to processing queued stale frames.

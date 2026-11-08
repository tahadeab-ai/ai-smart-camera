"""Verification test script for live WebSocket streaming performance in Colab."""

import asyncio
import io
import json
import os
import struct
import sys
import time

import aiohttp
import numpy as np
from PIL import Image


def load_test_frames(width: int = 640, height: int = 480, count: int = 10) -> list[bytes]:
    """Generates a sequence of deterministic frames with detectable objects for ByteTrack."""
    frames = []
    base_img = None

    try:
        from ultralytics.utils import ASSETS

        bus_path = ASSETS / "bus.jpg"
        if bus_path.exists():
            base_img = Image.open(bus_path).convert("RGB").resize((width, height))
    except Exception:
        base_img = None

    if base_img is None:
        # Fallback high-contrast synthetic image with recognizable geometry
        arr = np.full((height, width, 3), 180, dtype=np.uint8)
        # Person silhouette approximation
        arr[80:180, 260:320] = [30, 30, 30]
        arr[180:400, 240:340] = [40, 40, 80]
        base_img = Image.fromarray(arr)

    arr = np.array(base_img)
    for i in range(count):
        # Simulate gentle pan motion so ByteTrack maintains and updates tracks
        shift = (i * 2) % 40
        shifted = np.roll(arr, shift, axis=1)
        img = Image.fromarray(shifted)
        buf = io.BytesIO()
        img.save(buf, format="JPEG", quality=65)
        frames.append(buf.getvalue())

    return frames


async def verify_streaming_performance(
    base_url: str,
    access_token: str,
    duration_seconds: float = 5.0,
    target_send_fps: float = 15.0,
):
    """Executes live end-to-end streaming test over HTTP/WSS for a fixed test window."""
    print("=" * 65)
    print("AI SMART CAMERA v0.3.0 LIVE STREAMING PERFORMANCE TEST")
    print(f"Target:             {base_url}")
    print(f"Test Window:        {duration_seconds:.1f} seconds continuous streaming")
    print(f"Target Send FPS:    {target_send_fps:.1f} FPS (~{int(target_send_fps * duration_seconds)} frames)")
    print("=" * 65)

    test_frames = load_test_frames(640, 480, count=15)
    print(f"[+] Loaded {len(test_frames)} deterministic test frames with detectable objects.")

    async with aiohttp.ClientSession() as session:
        # 1. Verify REST API Health
        async with session.get(f"{base_url}/api/v1/health/ready") as resp:
            health_json = await resp.json()
            print(f"[1] Health Ready check: HTTP {resp.status} -> {health_json}")
            assert resp.status == 200, f"Expected 200, got {resp.status}"

        # 2. Acquire WebSocket ticket
        headers = {"Authorization": f"Bearer {access_token}"}
        ticket_url = f"{base_url}/api/v1/auth/ws-ticket"
        async with session.post(ticket_url, headers=headers) as resp:
            ticket_data = await resp.json()
            print(f"[2] WS Ticket request: HTTP {resp.status}")
            assert resp.status == 200, f"Failed ticket issuance: {ticket_data}"
            ticket = ticket_data["ticket"]
            print(f"    Ticket acquired: {ticket[:8]}... (expires in {ticket_data['expires_in']}s)")

        # 3. Connect to WebSocket stream
        ws_url = base_url.replace("http://", "ws://").replace("https://", "wss://")
        ws_endpoint = f"{ws_url}/api/v1/stream?ticket={ticket}"
        print(f"[3] Connecting to WebSocket: {ws_endpoint}")

        test_origin = base_url
        async with session.ws_connect(ws_endpoint, headers={"Origin": test_origin}) as ws:
            print("    Connected to WebSocket successfully.")

            # Send client configuration (correct names: enable_tracking, skip_interval >= 1)
            config_msg = {
                "type": "config",
                "confidence_threshold": 0.25,
                "iou_threshold": 0.45,
                "enable_tracking": True,
                "enable_trails": True,
                "skip_interval": 1,
                "image_size": 416,
                "return_annotated_frame": True,
            }
            await ws.send_str(json.dumps(config_msg))

            # Await config acknowledgment
            ack_msg = await ws.receive()
            if ack_msg.type == aiohttp.WSMsgType.TEXT:
                ack_data = json.loads(ack_msg.data)
                print(f"    Received config_ack: {ack_data}")
                assert ack_data.get("type") == "config_ack" and ack_data.get("status") == "ok"

            # Telemetry tracking structures
            sent_frames = 0
            received_metadata: list[dict] = []
            received_jpegs: list[tuple[int, bytes]] = []
            queue_latencies: list[float] = []
            server_latencies: list[float] = []
            paired_frame_ids: list[int] = []

            is_sending_active = True
            latest_meta_frame_id = None

            # Receiver worker task
            async def receive_worker():
                nonlocal latest_meta_frame_id
                while True:
                    try:
                        msg = await asyncio.wait_for(ws.receive(), timeout=3.0)
                        if msg.type == aiohttp.WSMsgType.TEXT:
                            data = json.loads(msg.data)
                            if data.get("type") in ("detection", "metadata"):
                                received_metadata.append(data)
                                latest_meta_frame_id = data.get("frame_id")
                                queue_latencies.append(data.get("queue_latency_ms", 0.0))
                                server_latencies.append(data.get("latency_ms", 0.0))
                        elif msg.type == aiohttp.WSMsgType.BINARY:
                            raw = msg.data
                            if len(raw) >= 4:
                                resp_fid = struct.unpack("!I", raw[:4])[0]
                                received_jpegs.append((resp_fid, raw[4:]))
                                # Strict pairing validation: verify matching frame_id
                                if latest_meta_frame_id is not None:
                                    assert resp_fid == latest_meta_frame_id, (
                                        f"Frame ID mismatch! metadata frame_id={latest_meta_frame_id} "
                                        f"!= binary frame_id={resp_fid}"
                                    )
                                    paired_frame_ids.append(resp_fid)
                        elif msg.type in (aiohttp.WSMsgType.CLOSED, aiohttp.WSMsgType.ERROR):
                            break
                    except TimeoutError:
                        if not is_sending_active:
                            # If all received metadata have their matching paired JPEG, exit cleanly
                            if len(received_jpegs) >= len(received_metadata):
                                break
                            # Otherwise allow up to 5.0s post-send drain time for remaining in-flight WAN JPEG
                            if (time.perf_counter() - test_start_t) > (duration_seconds + 5.0):
                                break

            recv_task = asyncio.create_task(receive_worker())

            # Stream frames continuously for explicit duration window
            test_start_t = time.perf_counter()
            send_interval = 1.0 / target_send_fps
            frame_id_counter = 0

            while (time.perf_counter() - test_start_t) < duration_seconds:
                frame_bytes = test_frames[frame_id_counter % len(test_frames)]
                frame_id_counter += 1
                header = struct.pack("!I", frame_id_counter)
                await ws.send_bytes(header + frame_bytes)
                sent_frames += 1
                await asyncio.sleep(send_interval)

            is_sending_active = False
            # Wait for receive worker to complete draining in-flight frames
            await recv_task
            total_duration = time.perf_counter() - test_start_t

            await ws.close()

    print("\n" + "=" * 65)
    print("STREAMING PERFORMANCE TEST RESULTS (FIXED TEST WINDOW)")
    print("=" * 65)
    processed_count = len(received_metadata)
    displayed_count = len(received_jpegs)

    print(f"Test Duration:           {total_duration:.2f} s")
    print(f"Client Sent Frames:      {sent_frames} (target cadence: {target_send_fps:.1f} FPS)")
    print(f"Server Processed Frames: {processed_count}")
    print(f"Server Returned JPEGs:   {displayed_count}")
    print(f"Strictly Paired Frames:  {len(paired_frame_ids)}")

    if received_metadata:
        last_meta = received_metadata[-1]
        server_drops = last_meta.get("dropped_frames", 0)
        queue_reps = last_meta.get("queue_replacements", 0)
        mean_queue_lag = float(np.mean(queue_latencies))
        max_queue_lag = float(np.max(queue_latencies))
        mean_server_lat = float(np.mean(server_latencies))
        effective_throughput = processed_count / total_duration
        reported_fps = float(last_meta.get("fps", 0.0))

        # Separate telemetry counters
        print(f"Server Dropped Frames:   {server_drops}")
        print(f"Server Queue Replacements:{queue_reps}")
        print(f"Effective Throughput:    {effective_throughput:.2f} FPS")
        print(f"Reported Server FPS:     {reported_fps:.2f} FPS")
        print(f"Mean Server Latency:     {mean_server_lat:.2f} ms")
        print(f"Mean Queue Dwell Lag:    {mean_queue_lag:.2f} ms")
        print(f"Max Queue Dwell Lag:     {max_queue_lag:.2f} ms")
        print(f"Tracked Objects Count:   {last_meta.get('stats', {}).get('tracked_count', 0)}")

        # Verification Assertions
        assert processed_count > 0, "No metadata received during test window!"
        assert displayed_count > 0, "No JPEG frames received during test window!"
        assert abs(displayed_count - processed_count) <= 1, f"Metadata ({processed_count}) and JPEG ({displayed_count}) count divergence!"
        assert len(paired_frame_ids) == displayed_count, "Frame ID pairing mismatch detected!"
        assert mean_queue_lag < 100.0, f"Mean queue latency too high: {mean_queue_lag:.2f} ms"

        print("\n[SUCCESS] Decoupled streaming engine verified! Strict pairing & zero latency drift.")
    else:
        raise RuntimeError("Zero frames processed during streaming test window!")


if __name__ == "__main__":
    url = sys.argv[1] if len(sys.argv) > 1 else "http://127.0.0.1:7860"
    token = sys.argv[2] if len(sys.argv) > 2 else os.getenv("ACCESS_TOKEN", "")
    duration = float(sys.argv[3]) if len(sys.argv) > 3 else 5.0
    asyncio.run(verify_streaming_performance(url, token, duration_seconds=duration))

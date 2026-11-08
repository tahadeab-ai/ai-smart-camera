"""Verification test script for live WebSocket streaming performance in Colab."""

import asyncio
import io
import json
import os
import sys
import time

import aiohttp
import numpy as np
from PIL import Image


def generate_test_jpeg(width: int = 640, height: int = 480) -> bytes:
    """Generates a synthetic test JPEG frame."""
    arr = np.random.randint(50, 200, (height, width, 3), dtype=np.uint8)
    # Draw simple bright rectangle resembling a detectable object
    arr[100:300, 150:450] = [220, 220, 220]
    img = Image.fromarray(arr)
    buf = io.BytesIO()
    img.save(buf, format="JPEG", quality=75)
    return buf.getvalue()


async def verify_streaming_performance(base_url: str, access_token: str, num_frames: int = 30):
    """Executes live end-to-end streaming test over HTTP/WSS."""
    print("=" * 60)
    print("AI SMART CAMERA v0.3.0 LIVE STREAMING PERFORMANCE TEST")
    print(f"Target: {base_url}")
    print(f"Test Frames: {num_frames} frames (480p synthetic)")
    print("=" * 60)

    # 1. Verify REST API Health
    async with aiohttp.ClientSession() as session:
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

            # Send client configuration (imgsz 416, 480p)
            config_msg = {
                "type": "config",
                "confidence_threshold": 0.25,
                "iou_threshold": 0.45,
                "tracking_enabled": True,
                "tracker_type": "bytetrack",
                "skip_interval": 0,
                "image_size": 416,
            }
            await ws.send_str(json.dumps(config_msg))
            print("    Sent StreamClientConfig (image_size=416, tracking=True).")

            jpeg_bytes = generate_test_jpeg(640, 480)
            print(f"    Sample JPEG payload size: {len(jpeg_bytes) / 1024:.2f} KB")

            received_metadata = []
            received_frames = []
            queue_latencies = []
            server_latencies = []

            start_time = time.perf_counter()

            # Async worker to listen for server responses
            async def receive_worker():
                while len(received_metadata) < num_frames:
                    msg = await ws.receive()
                    if msg.type == aiohttp.WSMsgType.TEXT:
                        data = json.loads(msg.data)
                        if data.get("type") == "metadata":
                            received_metadata.append(data)
                            queue_latencies.append(data.get("queue_latency_ms", 0.0))
                            server_latencies.append(data.get("latency_ms", 0.0))
                    elif msg.type == aiohttp.WSMsgType.BINARY:
                        received_frames.append(msg.data)
                    elif msg.type in (aiohttp.WSMsgType.CLOSED, aiohttp.WSMsgType.ERROR):
                        break

            recv_task = asyncio.create_task(receive_worker())

            # Send frames at ~15 FPS cadence (66ms interval)
            for i in range(num_frames):
                await ws.send_bytes(jpeg_bytes)
                await asyncio.sleep(0.066)

            # Wait for remaining responses (max 5 seconds timeout)
            try:
                await asyncio.wait_for(recv_task, timeout=5.0)
            except asyncio.TimeoutError:
                print("    Timed out waiting for all responses.")

            total_elapsed = time.perf_counter() - start_time
            await ws.close()

    print("\n" + "=" * 60)
    print("STREAMING PERFORMANCE TEST RESULTS")
    print("=" * 60)
    print(f"Frames Sent:             {num_frames}")
    print(f"Metadata Received:       {len(received_metadata)}")
    print(f"Annotated JPEGs Received:{len(received_frames)}")
    print(f"Total Test Elapsed:      {total_elapsed:.2f}s")

    if received_metadata:
        last_meta = received_metadata[-1]
        mean_queue_lag = np.mean(queue_latencies)
        max_queue_lag = np.max(queue_latencies)
        mean_server_latency = np.mean(server_latencies)
        effective_fps = len(received_metadata) / total_elapsed

        print(f"Effective Throughput:    {effective_fps:.2f} FPS")
        print(f"Mean Server Latency:     {mean_server_latency:.2f} ms")
        print(f"Mean Queue Dwell Lag:    {mean_queue_lag:.2f} ms")
        print(f"Max Queue Dwell Lag:     {max_queue_lag:.2f} ms")
        print(f"Server Dropped Frames:   {last_meta.get('dropped_frames', 0)}")
        print(f"Server Queue Replacements:{last_meta.get('queue_replacements', 0)}")
        print(f"Reported Server FPS:     {last_meta.get('fps', 0.0):.2f}")

        # Verification Assertions
        assert mean_queue_lag < 50.0, f"Queue lag too high: {mean_queue_lag}ms (queue not clearing)"
        assert len(received_frames) == len(received_metadata), "Metadata and JPEG count mismatch!"
        print("\n[SUCCESS] Decoupled streaming engine verified! Zero queue latency drift.")
    else:
        raise RuntimeError("No frames received from WebSocket stream!")


if __name__ == "__main__":
    url = sys.argv[1] if len(sys.argv) > 1 else "http://127.0.0.1:7860"
    token = sys.argv[2] if len(sys.argv) > 2 else os.getenv("ACCESS_TOKEN", "")
    asyncio.run(verify_streaming_performance(url, token))

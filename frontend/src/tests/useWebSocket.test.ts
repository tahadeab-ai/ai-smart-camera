import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useWebSocket } from '../hooks/useWebSocket';
import { ApiClient } from '../api/client';

class MockWebSocket {
  static instances: MockWebSocket[] = [];
  url: string;
  binaryType: string = 'blob';
  readyState: number = WebSocket.CONNECTING;
  bufferedAmount: number = 0;
  onopen: (() => void) | null = null;
  onclose: ((event: { code: number }) => void) | null = null;
  onmessage: ((event: { data: unknown }) => void) | null = null;
  onerror: (() => void) | null = null;

  constructor(url: string) {
    this.url = url;
    MockWebSocket.instances.push(this);
  }

  send = vi.fn();
  close = vi.fn(() => {
    this.readyState = WebSocket.CLOSED;
    if (this.onclose) this.onclose({ code: 1000 });
  });
}

describe('useWebSocket', () => {
  beforeEach(() => {
    MockWebSocket.instances = [];
    vi.stubGlobal('WebSocket', MockWebSocket);
    vi.spyOn(ApiClient, 'getWsTicket').mockResolvedValue({
      ticket: 'mock-ticket-abc',
      expires_in: 30,
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
    ApiClient.clearToken();
  });

  it('initializes in disconnected state', () => {
    const { result } = renderHook(() => useWebSocket());
    expect(result.current.isConnected).toBe(false);
    expect(result.current.error).toBeNull();
  });

  it('acquires ticket and establishes connection', async () => {
    const { result } = renderHook(() => useWebSocket());

    await act(async () => {
      await result.current.connect();
    });

    expect(ApiClient.getWsTicket).toHaveBeenCalled();
    expect(MockWebSocket.instances.length).toBe(1);
    expect(MockWebSocket.instances[0].url).toContain('ticket=mock-ticket-abc');

    // Simulate open
    act(() => {
      const ws = MockWebSocket.instances[0];
      ws.readyState = WebSocket.OPEN;
      if (ws.onopen) ws.onopen();
    });

    expect(result.current.isConnected).toBe(true);
  });

  it('never puts permanent token into the WebSocket URL query string', async () => {
    ApiClient.setToken('super-secret-permanent-master-token');
    const { result } = renderHook(() => useWebSocket());

    await act(async () => {
      await result.current.connect();
    });

    expect(MockWebSocket.instances.length).toBe(1);
    const wsUrl = MockWebSocket.instances[0].url;
    expect(wsUrl).not.toContain('token=');
    expect(wsUrl).not.toContain('super-secret-permanent-master-token');
    expect(wsUrl).toContain('ticket=mock-ticket-abc');
  });

  it('aborts connection attempt if ticket acquisition fails with 401', async () => {
    vi.spyOn(ApiClient, 'getWsTicket').mockRejectedValueOnce(new Error('HTTP 401 Unauthorized'));
    const { result } = renderHook(() => useWebSocket());

    await act(async () => {
      await result.current.connect();
    });

    expect(MockWebSocket.instances.length).toBe(0);
    expect(result.current.isConnected).toBe(false);
    expect(result.current.error).toContain('Authentication required');
  });

  it('sends reset_tracker with request_id and resolves true when matching request_id is acked', async () => {
    const { result } = renderHook(() => useWebSocket());

    await act(async () => {
      await result.current.connect();
    });

    const ws = MockWebSocket.instances[0];
    ws.readyState = WebSocket.OPEN;

    let resetPromise: Promise<boolean>;
    act(() => {
      resetPromise = result.current.sendResetTracker(1000);
    });

    expect(ws.send).toHaveBeenCalledTimes(1);
    const sentMsg = JSON.parse(ws.send.mock.calls[0][0]);
    expect(sentMsg.type).toBe('reset_tracker');
    expect(typeof sentMsg.request_id).toBe('string');
    expect(sentMsg.request_id.length).toBeGreaterThan(0);

    // Simulate reset_tracker_ack from server with matching request_id
    await act(async () => {
      if (ws.onmessage) {
        ws.onmessage({
          data: JSON.stringify({
            type: 'reset_tracker_ack',
            status: 'ok',
            request_id: sentMsg.request_id,
          }),
        });
      }
    });

    const success = await resetPromise!;
    expect(success).toBe(true);
  });

  it('supports concurrent reset requests and correlates out-of-order acknowledgements', async () => {
    const { result } = renderHook(() => useWebSocket());

    await act(async () => {
      await result.current.connect();
    });

    const ws = MockWebSocket.instances[0];
    ws.readyState = WebSocket.OPEN;

    let p1: Promise<boolean>;
    let p2: Promise<boolean>;

    act(() => {
      p1 = result.current.sendResetTracker(2000);
      p2 = result.current.sendResetTracker(2000);
    });

    expect(ws.send).toHaveBeenCalledTimes(2);
    const msg1 = JSON.parse(ws.send.mock.calls[0][0]);
    const msg2 = JSON.parse(ws.send.mock.calls[1][0]);
    expect(msg1.request_id).toBeDefined();
    expect(msg2.request_id).toBeDefined();
    expect(msg1.request_id).not.toBe(msg2.request_id);

    let p1Resolved = false;
    let p2Resolved = false;
    p1!.then(() => {
      p1Resolved = true;
    });
    p2!.then(() => {
      p2Resolved = true;
    });

    // 1. Deliver ACK for request 2 FIRST (out of order)
    await act(async () => {
      if (ws.onmessage) {
        ws.onmessage({
          data: JSON.stringify({
            type: 'reset_tracker_ack',
            status: 'ok',
            request_id: msg2.request_id,
          }),
        });
      }
    });

    const res2 = await p2!;
    expect(res2).toBe(true);
    expect(p2Resolved).toBe(true);
    expect(p1Resolved).toBe(false); // p1 must still be pending!

    // 2. Deliver ACK for request 1 SECOND
    await act(async () => {
      if (ws.onmessage) {
        ws.onmessage({
          data: JSON.stringify({
            type: 'reset_tracker_ack',
            status: 'ok',
            request_id: msg1.request_id,
          }),
        });
      }
    });

    const res1 = await p1!;
    expect(res1).toBe(true);
    expect(p1Resolved).toBe(true);
  });

  it('handles timeout for one request without affecting another in-flight request', async () => {
    vi.useFakeTimers();
    const { result } = renderHook(() => useWebSocket());

    await act(async () => {
      await result.current.connect();
    });

    const ws = MockWebSocket.instances[0];
    ws.readyState = WebSocket.OPEN;

    let p1: Promise<boolean>;
    let p2: Promise<boolean>;

    act(() => {
      p1 = result.current.sendResetTracker(300); // 300ms timeout
      p2 = result.current.sendResetTracker(2000); // 2000ms timeout
    });

    const msg1 = JSON.parse(ws.send.mock.calls[0][0]);
    const msg2 = JSON.parse(ws.send.mock.calls[1][0]);
    expect(msg1.request_id).toBeDefined();
    expect(msg2.request_id).toBeDefined();

    // Advance by 400ms -> p1 times out, p2 remains pending
    await act(async () => {
      vi.advanceTimersByTime(400);
    });

    const res1 = await p1!;
    expect(res1).toBe(false);

    // Deliver ACK for p2 before its 2000ms expires
    await act(async () => {
      if (ws.onmessage) {
        ws.onmessage({
          data: JSON.stringify({
            type: 'reset_tracker_ack',
            status: 'ok',
            request_id: msg2.request_id,
          }),
        });
      }
    });

    const res2 = await p2!;
    expect(res2).toBe(true);

    vi.useRealTimers();
  });

  it('cancels all pending reset requests and resolves false on disconnect', async () => {
    const { result } = renderHook(() => useWebSocket());

    await act(async () => {
      await result.current.connect();
    });

    const ws = MockWebSocket.instances[0];
    ws.readyState = WebSocket.OPEN;

    let p1: Promise<boolean>;
    let p2: Promise<boolean>;

    act(() => {
      p1 = result.current.sendResetTracker(5000);
      p2 = result.current.sendResetTracker(5000);
    });

    act(() => {
      result.current.disconnect();
    });

    const [res1, res2] = await Promise.all([p1!, p2!]);
    expect(res1).toBe(false);
    expect(res2).toBe(false);
    expect(result.current.isConnected).toBe(false);
  });

  it('cleans up on disconnect', async () => {
    const { result } = renderHook(() => useWebSocket());

    await act(async () => {
      await result.current.connect();
    });

    act(() => {
      result.current.disconnect();
    });

    expect(result.current.isConnected).toBe(false);
  });
});

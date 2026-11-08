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
  });

  it('initializes in disconnected state', () => {
    const { result } = renderHook(() => useWebSocket());
    expect(result.current.isConnected).toBe(false);
    expect(result.current.error).toBeNull();
  });

  it('acquires ticket and establishes connection', async () => {
    const { result } = renderHook(() => useWebSocket());

    await act(async () => {
      result.current.connect();
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

  it('cleans up on disconnect', async () => {
    const { result } = renderHook(() => useWebSocket());

    await act(async () => {
      result.current.connect();
    });

    act(() => {
      result.current.disconnect();
    });

    expect(result.current.isConnected).toBe(false);
  });
});

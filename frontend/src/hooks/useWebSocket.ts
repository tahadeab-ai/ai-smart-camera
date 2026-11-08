import { useCallback, useEffect, useRef, useState } from 'react';
import { ApiClient } from '../api/client';
import { StreamConfig, StreamMetadata } from '../types';

export interface UseWebSocketOptions {
  onMetadata?: (meta: StreamMetadata) => void;
  onAnnotatedFrame?: (frameUrl: string, frameId: number) => void;
  config?: StreamConfig;
}

const INITIAL_RECONNECT_DELAY_MS = 1000;
const MAX_RECONNECT_DELAY_MS = 30000;
const RECONNECT_FACTOR = 1.5;
const MAX_RECONNECT_ATTEMPTS = 5;

interface PendingResetRequest {
  resolve: (success: boolean) => void;
  timer: number;
}

export function useWebSocket(options: UseWebSocketOptions = {}) {
  const { onMetadata, onAnnotatedFrame, config } = options;

  const wsRef = useRef<WebSocket | null>(null);
  const frameIdRef = useRef<number>(0);
  const lastObjectUrlRef = useRef<string | null>(null);
  const isManualDisconnectRef = useRef<boolean>(false);
  const reconnectAttemptsRef = useRef<number>(0);
  const reconnectTimeoutRef = useRef<number | null>(null);
  const pendingResetRequestsRef = useRef<Map<string, PendingResetRequest>>(new Map());

  const [isConnected, setIsConnected] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  // Clean up object URLs to prevent memory leaks
  const cleanupLastObjectUrl = useCallback(() => {
    if (lastObjectUrlRef.current) {
      URL.revokeObjectURL(lastObjectUrlRef.current);
      lastObjectUrlRef.current = null;
    }
  }, []);

  // Internal connection executor
  const executeConnect = useCallback(async () => {
    if (
      wsRef.current &&
      (wsRef.current.readyState === WebSocket.OPEN ||
        wsRef.current.readyState === WebSocket.CONNECTING)
    ) {
      return;
    }

    setError(null);

    // Acquire single-use ticket (permanent tokens are strictly forbidden in WebSocket query URLs)
    let ticket: string | null = null;
    try {
      const ticketRes = await ApiClient.getWsTicket();
      ticket = ticketRes.ticket;
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      if (msg.includes('401') || msg.includes('Unauthorized') || msg.includes('Authentication')) {
        setError('Authentication required: invalid or missing access token.');
        return; // A failed ticket request must stop the connection attempt
      }
      // If public mode (auth disabled on server), ticket request returns 200 or 404/ignored
      console.debug('Connecting in public mode without ticket:', msg);
    }

    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const host = window.location.host;
    const url = new URL(`${protocol}//${host}/api/v1/stream`);
    if (ticket) {
      url.searchParams.set('ticket', ticket);
    }

    try {
      const ws = new WebSocket(url.toString());
      ws.binaryType = 'arraybuffer';
      wsRef.current = ws;

      ws.onopen = () => {
        setIsConnected(true);
        setError(null);
        reconnectAttemptsRef.current = 0; // Reset backoff counter on success

        if (config) {
          ws.send(JSON.stringify({ type: 'config', ...config }));
        }
      };

      ws.onmessage = (event: MessageEvent) => {
        if (typeof event.data === 'string') {
          try {
            const data = JSON.parse(event.data);
            if (data.type === 'detection' && onMetadata) {
              onMetadata(data as StreamMetadata);
            } else if (data.type === 'reset_tracker_ack') {
              const reqId = data.request_id as string | undefined;
              if (reqId && pendingResetRequestsRef.current.has(reqId)) {
                const entry = pendingResetRequestsRef.current.get(reqId)!;
                clearTimeout(entry.timer);
                pendingResetRequestsRef.current.delete(reqId);
                console.debug(`Backend tracker reset confirmed for request ${reqId}`);
                entry.resolve(true);
              } else if (!reqId && pendingResetRequestsRef.current.size > 0) {
                // Fallback for un-tagged ack (e.g. legacy backend)
                const firstEntry = pendingResetRequestsRef.current.entries().next().value;
                if (firstEntry) {
                  const [firstId, entry] = firstEntry;
                  clearTimeout(entry.timer);
                  pendingResetRequestsRef.current.delete(firstId);
                  console.debug(`Backend tracker reset confirmed for un-tagged request ${firstId}`);
                  entry.resolve(true);
                }
              }
            }
          } catch (e) {
            console.warn('Failed to parse WebSocket text message:', e);
          }
        } else if (event.data instanceof ArrayBuffer) {
          // Binary message: [4 bytes frame_id] + [JPEG bytes]
          if (event.data.byteLength > 4 && onAnnotatedFrame) {
            const view = new DataView(event.data);
            const frameId = view.getUint32(0, false);
            const jpegBlob = new Blob([event.data.slice(4)], { type: 'image/jpeg' });
            const url = URL.createObjectURL(jpegBlob);

            // Clean up previous Object URL immediately to prevent heap growth
            cleanupLastObjectUrl();
            lastObjectUrlRef.current = url;
            onAnnotatedFrame(url, frameId);
          }
        }
      };

      ws.onclose = (event) => {
        setIsConnected(false);
        cleanupLastObjectUrl();

        // Cancel any pending tracker reset promises on socket close
        const pending = pendingResetRequestsRef.current;
        pendingResetRequestsRef.current = new Map();
        pending.forEach(({ resolve, timer }) => {
          clearTimeout(timer);
          resolve(false);
        });

        if (event.code === 1008) {
          setError('Authentication failed: Invalid access token or ticket.');
          return; // Do not auto-reconnect on auth failure
        }
        if (event.code === 1013) {
          setError('Max concurrent streams reached on server.');
        }

        // Schedule auto-reconnect if closure was unexpected
        if (
          !isManualDisconnectRef.current &&
          reconnectAttemptsRef.current < MAX_RECONNECT_ATTEMPTS
        ) {
          const attempt = reconnectAttemptsRef.current;
          const delay = Math.min(
            MAX_RECONNECT_DELAY_MS,
            INITIAL_RECONNECT_DELAY_MS * Math.pow(RECONNECT_FACTOR, attempt)
          );
          const jitter = Math.random() * 500;
          const totalDelay = Math.round(delay + jitter);

          console.warn(
            `WebSocket disconnected. Reconnecting in ${totalDelay}ms (attempt ${
              attempt + 1
            }/${MAX_RECONNECT_ATTEMPTS})...`
          );
          reconnectAttemptsRef.current += 1;

          reconnectTimeoutRef.current = window.setTimeout(() => {
            executeConnect();
          }, totalDelay);
        } else if (reconnectAttemptsRef.current >= MAX_RECONNECT_ATTEMPTS) {
          setError('WebSocket disconnected: Maximum reconnect attempts exceeded.');
        }
      };

      ws.onerror = () => {
        setError('WebSocket connection error.');
      };
    } catch (err: unknown) {
      setError(`WebSocket initialization error: ${err}`);
    }
  }, [cleanupLastObjectUrl, config, onAnnotatedFrame, onMetadata]);

  // Connect initiating user action
  const connect = useCallback(() => {
    isManualDisconnectRef.current = false;
    reconnectAttemptsRef.current = 0;
    if (reconnectTimeoutRef.current) {
      clearTimeout(reconnectTimeoutRef.current);
      reconnectTimeoutRef.current = null;
    }
    executeConnect();
  }, [executeConnect]);

  // Disconnect WebSocket and cancel pending reconnects
  const disconnect = useCallback(() => {
    isManualDisconnectRef.current = true;
    if (reconnectTimeoutRef.current) {
      clearTimeout(reconnectTimeoutRef.current);
      reconnectTimeoutRef.current = null;
    }
    const pending = pendingResetRequestsRef.current;
    pendingResetRequestsRef.current = new Map();
    pending.forEach(({ resolve, timer }) => {
      clearTimeout(timer);
      resolve(false);
    });
    if (wsRef.current) {
      wsRef.current.close();
      wsRef.current = null;
    }
    cleanupLastObjectUrl();
    setIsConnected(false);
  }, [cleanupLastObjectUrl]);

  // Send binary frame with frame_id and backpressure prevention
  const sendFrame = useCallback((jpegBytes: Uint8Array): boolean => {
    const ws = wsRef.current;
    if (!ws || ws.readyState !== WebSocket.OPEN) {
      return false;
    }

    // Backpressure check: Drop frame if client buffer is congested
    if (ws.bufferedAmount > 256 * 1024) {
      return false;
    }

    frameIdRef.current += 1;
    const frameId = frameIdRef.current;

    const buffer = new Uint8Array(4 + jpegBytes.byteLength);
    const view = new DataView(buffer.buffer);
    view.setUint32(0, frameId, false);
    buffer.set(jpegBytes, 4);

    ws.send(buffer);
    return true;
  }, []);

  // Update server stream configuration
  const sendConfig = useCallback((newConfig: Partial<StreamConfig>) => {
    const ws = wsRef.current;
    if (ws && ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify({ type: 'config', ...newConfig }));
    }
  }, []);

  // Explicitly reset server-side ByteTrack tracker with request_id correlation & timeout
  const sendResetTracker = useCallback((timeoutMs: number = 3000): Promise<boolean> => {
    const ws = wsRef.current;
    if (!ws || ws.readyState !== WebSocket.OPEN) {
      return Promise.resolve(false);
    }

    const requestId =
      typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
        ? crypto.randomUUID()
        : `req_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;

    return new Promise<boolean>((resolve) => {
      const timer = window.setTimeout(() => {
        pendingResetRequestsRef.current.delete(requestId);
        console.warn(`reset_tracker_ack timed out after ${timeoutMs}ms for request ${requestId}`);
        resolve(false);
      }, timeoutMs);

      pendingResetRequestsRef.current.set(requestId, { resolve, timer });

      try {
        ws.send(JSON.stringify({ type: 'reset_tracker', request_id: requestId }));
      } catch (err) {
        clearTimeout(timer);
        pendingResetRequestsRef.current.delete(requestId);
        console.warn('Failed to send reset_tracker message:', err);
        resolve(false);
      }
    });
  }, []);

  // Inspect client socket outbound buffer for backpressure control
  const getBufferedAmount = useCallback((): number => {
    return wsRef.current ? wsRef.current.bufferedAmount : 0;
  }, []);

  useEffect(() => {
    return () => {
      disconnect();
    };
  }, [disconnect]);

  return {
    isConnected,
    error,
    connect,
    disconnect,
    sendFrame,
    sendConfig,
    sendResetTracker,
    getBufferedAmount,
  };
}

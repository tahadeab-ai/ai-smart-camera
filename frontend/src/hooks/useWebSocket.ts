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

export function useWebSocket(options: UseWebSocketOptions = {}) {
  const { onMetadata, onAnnotatedFrame, config } = options;

  const wsRef = useRef<WebSocket | null>(null);
  const frameIdRef = useRef<number>(0);
  const lastObjectUrlRef = useRef<string | null>(null);
  const isManualDisconnectRef = useRef<boolean>(false);
  const reconnectAttemptsRef = useRef<number>(0);
  const reconnectTimeoutRef = useRef<number | null>(null);

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
    if (wsRef.current && (wsRef.current.readyState === WebSocket.OPEN || wsRef.current.readyState === WebSocket.CONNECTING)) {
      return;
    }

    setError(null);

    // Acquire single-use ticket if possible
    let ticket: string | null = null;
    try {
      const ticketRes = await ApiClient.getWsTicket();
      ticket = ticketRes.ticket;
    } catch (err: unknown) {
      // If server does not require tickets or auth failed
      const msg = err instanceof Error ? err.message : String(err);
      if (msg.includes('401') || msg.includes('Unauthorized')) {
        setError('Authentication required: invalid or missing token.');
        return;
      }
      // If endpoint not requiring auth or server doesn't use tickets
      logger: console.debug('Proceeding without ticket:', msg);
    }

    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const host = window.location.host;
    const url = new URL(`${protocol}//${host}/api/v1/stream`);
    if (ticket) {
      url.searchParams.set('ticket', ticket);
    } else {
      const token = ApiClient.getToken();
      if (token) {
        url.searchParams.set('token', token);
      }
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
            const meta = JSON.parse(event.data) as StreamMetadata;
            if (meta.type === 'detection' && onMetadata) {
              onMetadata(meta);
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

        if (event.code === 1008) {
          setError('Authentication failed: Invalid access token or ticket.');
          return; // Do not auto-reconnect on auth failure
        }
        if (event.code === 1013) {
          setError('Max concurrent streams reached on server.');
        }

        // Schedule auto-reconnect if closure was unexpected
        if (!isManualDisconnectRef.current && reconnectAttemptsRef.current < MAX_RECONNECT_ATTEMPTS) {
          const attempt = reconnectAttemptsRef.current;
          const delay = Math.min(
            MAX_RECONNECT_DELAY_MS,
            INITIAL_RECONNECT_DELAY_MS * Math.pow(RECONNECT_FACTOR, attempt)
          );
          const jitter = Math.random() * 500;
          const totalDelay = Math.round(delay + jitter);

          console.warn(`WebSocket disconnected. Reconnecting in ${totalDelay}ms (attempt ${attempt + 1}/${MAX_RECONNECT_ATTEMPTS})...`);
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
  };
}

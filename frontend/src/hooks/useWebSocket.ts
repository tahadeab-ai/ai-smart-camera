import { useCallback, useEffect, useRef, useState } from 'react';
import { StreamConfig, StreamMetadata } from '../types';

export interface UseWebSocketOptions {
  onMetadata?: (meta: StreamMetadata) => void;
  onAnnotatedFrame?: (frameUrl: string, frameId: number) => void;
  config?: StreamConfig;
}

export function useWebSocket(options: UseWebSocketOptions = {}) {
  const { onMetadata, onAnnotatedFrame, config } = options;

  const wsRef = useRef<WebSocket | null>(null);
  const frameIdRef = useRef<number>(0);
  const lastObjectUrlRef = useRef<string | null>(null);

  const [isConnected, setIsConnected] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  // Connect to WebSocket endpoint
  const connect = useCallback(() => {
    if (wsRef.current && (wsRef.current.readyState === WebSocket.OPEN || wsRef.current.readyState === WebSocket.CONNECTING)) {
      return;
    }

    setError(null);
    const token = localStorage.getItem('ai_cam_token');
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const host = window.location.host;
    const url = new URL(`${protocol}//${host}/api/v1/stream`);
    if (token) {
      url.searchParams.set('token', token);
    }

    try {
      const ws = new WebSocket(url.toString());
      ws.binaryType = 'arraybuffer';
      wsRef.current = ws;

      ws.onopen = () => {
        setIsConnected(true);
        setError(null);
        // Send initial configuration
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

            // Clean up previous URL to prevent memory leaks
            if (lastObjectUrlRef.current) {
              URL.revokeObjectURL(lastObjectUrlRef.current);
            }
            lastObjectUrlRef.current = url;
            onAnnotatedFrame(url, frameId);
          }
        }
      };

      ws.onclose = (event) => {
        setIsConnected(false);
        if (event.code === 1008) {
          setError('Authentication failed: Invalid access token.');
        } else if (event.code === 1013) {
          setError('Max concurrent streams reached on server.');
        }
      };

      ws.onerror = () => {
        setError('WebSocket connection error.');
      };
    } catch (err: unknown) {
      setError(`WebSocket initialization error: ${err}`);
    }
  }, [config, onAnnotatedFrame, onMetadata]);

  // Disconnect WebSocket
  const disconnect = useCallback(() => {
    if (wsRef.current) {
      wsRef.current.close();
      wsRef.current = null;
    }
    if (lastObjectUrlRef.current) {
      URL.revokeObjectURL(lastObjectUrlRef.current);
      lastObjectUrlRef.current = null;
    }
    setIsConnected(false);
  }, []);

  // Send binary frame with frame_id and backpressure prevention
  const sendFrame = useCallback((jpegBytes: Uint8Array): boolean => {
    const ws = wsRef.current;
    if (!ws || ws.readyState !== WebSocket.OPEN) {
      return false;
    }

    // Backpressure check: Drop frame if buffer is congested
    if (ws.bufferedAmount > 256 * 1024) {
      return false; // Skip frame to prioritize latest-frame processing
    }

    frameIdRef.current += 1;
    const frameId = frameIdRef.current;

    // Allocate buffer: 4-byte header + JPEG bytes
    const buffer = new Uint8Array(4 + jpegBytes.byteLength);
    const view = new DataView(buffer.buffer);
    view.setUint32(0, frameId, false); // Big-endian
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

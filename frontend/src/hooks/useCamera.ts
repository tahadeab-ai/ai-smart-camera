import { useCallback, useEffect, useRef, useState } from 'react';

export interface UseCameraOptions {
  width?: number;
  height?: number;
  idealFacingMode?: 'user' | 'environment';
}

export function useCamera(options: UseCameraOptions = {}) {
  const { width = 640, height = 480, idealFacingMode = 'user' } = options;

  const videoRef = useRef<HTMLVideoElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);

  const [isActive, setIsActive] = useState<boolean>(false);
  const [facingMode, setFacingMode] = useState<'user' | 'environment'>(idealFacingMode);
  const [error, setError] = useState<string | null>(null);
  const [devices, setDevices] = useState<MediaDeviceInfo[]>([]);
  const [selectedDeviceId, setSelectedDeviceId] = useState<string>('');

  // Enumerate video devices
  const updateDevices = useCallback(async () => {
    try {
      if (!navigator.mediaDevices?.enumerateDevices) return;
      const allDevices = await navigator.mediaDevices.enumerateDevices();
      const videoDevs = allDevices.filter((d) => d.kind === 'videoinput');
      setDevices(videoDevs);
      if (videoDevs.length > 0 && !selectedDeviceId) {
        setSelectedDeviceId(videoDevs[0].deviceId);
      }
    } catch (err) {
      console.warn('Could not enumerate video devices:', err);
    }
  }, [selectedDeviceId]);

  useEffect(() => {
    updateDevices();
  }, [updateDevices]);

  // Start video stream
  const startCamera = useCallback(async () => {
    setError(null);
    try {
      if (streamRef.current) {
        streamRef.current.getTracks().forEach((t) => t.stop());
      }

      const constraints: MediaStreamConstraints = {
        audio: false,
        video: selectedDeviceId
          ? { deviceId: { exact: selectedDeviceId }, width: { ideal: width }, height: { ideal: height } }
          : { facingMode, width: { ideal: width }, height: { ideal: height } },
      };

      const stream = await navigator.mediaDevices.getUserMedia(constraints);
      streamRef.current = stream;

      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play();
      }

      setIsActive(true);
      await updateDevices();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      setError(`Camera access error: ${msg}`);
      setIsActive(false);
    }
  }, [facingMode, height, selectedDeviceId, updateDevices, width]);

  // Stop video stream
  const stopCamera = useCallback(() => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
    }
    if (videoRef.current) {
      videoRef.current.srcObject = null;
    }
    setIsActive(false);
  }, []);

  // Toggle front/rear camera
  const toggleFacingMode = useCallback(() => {
    setSelectedDeviceId('');
    setFacingMode((prev) => (prev === 'user' ? 'environment' : 'user'));
  }, []);

  // Capture current video frame to JPEG bytes
  const captureFrameJpeg = useCallback(
    async (quality: number = 0.75): Promise<Uint8Array | null> => {
      const video = videoRef.current;
      if (!video || video.readyState < 2 || !video.videoWidth) {
        return null;
      }

      if (!canvasRef.current) {
        canvasRef.current = document.createElement('canvas');
      }
      const canvas = canvasRef.current;
      if (canvas.width !== video.videoWidth || canvas.height !== video.videoHeight) {
        canvas.width = video.videoWidth;
        canvas.height = video.videoHeight;
      }

      const ctx = canvas.getContext('2d', { alpha: false });
      if (!ctx) return null;

      ctx.drawImage(video, 0, 0, canvas.width, canvas.height);

      return new Promise<Uint8Array | null>((resolve) => {
        canvas.toBlob(
          (blob) => {
            if (!blob) {
              resolve(null);
              return;
            }
            blob
              .arrayBuffer()
              .then((buf) => resolve(new Uint8Array(buf)))
              .catch(() => resolve(null));
          },
          'image/jpeg',
          quality
        );
      });
    },
    []
  );

  useEffect(() => {
    return () => {
      stopCamera();
    };
  }, [stopCamera]);

  return {
    videoRef,
    isActive,
    facingMode,
    error,
    devices,
    selectedDeviceId,
    setSelectedDeviceId,
    startCamera,
    stopCamera,
    toggleFacingMode,
    captureFrameJpeg,
  };
}

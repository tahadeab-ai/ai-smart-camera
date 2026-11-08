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
  const isTransitioningRef = useRef<boolean>(false);

  const [isActive, setIsActive] = useState<boolean>(false);
  const [facingMode, setFacingMode] = useState<'user' | 'environment'>(idealFacingMode);
  const [error, setError] = useState<string | null>(null);
  const [devices, setDevices] = useState<MediaDeviceInfo[]>([]);
  const [selectedDeviceId, setSelectedDeviceId] = useState<string>('');

  // Enumerate video input devices safely
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

  // Cleanly stop any existing active stream tracks
  const stopTracks = useCallback(() => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((track) => {
        try {
          track.stop();
        } catch {
          // Ignore
        }
      });
      streamRef.current = null;
    }
    if (videoRef.current) {
      videoRef.current.srcObject = null;
    }
  }, []);

  // Stop camera and reset active state
  const stopCamera = useCallback(() => {
    isTransitioningRef.current = false;
    stopTracks();
    setIsActive(false);
  }, [stopTracks]);

  // Start or transition video stream
  const startCamera = useCallback(async () => {
    if (isTransitioningRef.current) return;
    isTransitioningRef.current = true;
    setError(null);

    // Stop existing tracks first to avoid camera hardware lockups
    stopTracks();

    const buildConstraints = (useDeviceId: boolean): MediaStreamConstraints => ({
      audio: false,
      video: useDeviceId && selectedDeviceId
        ? { deviceId: { exact: selectedDeviceId }, width: { ideal: width }, height: { ideal: height } }
        : { facingMode, width: { ideal: width }, height: { ideal: height } },
    });

    try {
      let stream: MediaStream;
      try {
        stream = await navigator.mediaDevices.getUserMedia(buildConstraints(true));
      } catch (err: unknown) {
        // Fallback if exact deviceId constraints were overconstrained
        if (err instanceof DOMException && (err.name === 'OverconstrainedError' || err.name === 'ConstraintNotSatisfiedError')) {
          console.warn('Overconstrained deviceId, falling back to facingMode constraint...');
          stream = await navigator.mediaDevices.getUserMedia(buildConstraints(false));
        } else {
          throw err;
        }
      }

      streamRef.current = stream;

      const video = videoRef.current;
      if (video) {
        video.srcObject = stream;
        // Wait for metadata load
        if (video.readyState < 1) {
          await new Promise<void>((resolve) => {
            const onMeta = () => {
              video.removeEventListener('loadedmetadata', onMeta);
              resolve();
            };
            video.addEventListener('loadedmetadata', onMeta);
          });
        }
        await video.play().catch((playErr) => {
          console.warn('Autoplay prevented or interrupted:', playErr);
        });
      }

      setIsActive(true);
      await updateDevices();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      setError(`Camera access error: ${msg}`);
      setIsActive(false);
      stopTracks();
    } finally {
      isTransitioningRef.current = false;
    }
  }, [facingMode, height, selectedDeviceId, stopTracks, updateDevices, width]);

  // Toggle front/rear camera
  const toggleFacingMode = useCallback(async () => {
    setSelectedDeviceId('');
    setFacingMode((prev) => (prev === 'user' ? 'environment' : 'user'));
  }, []);

  // Capture current video frame to JPEG bytes
  const captureFrameJpeg = useCallback(
    async (quality: number = 0.75): Promise<Uint8Array | null> => {
      if (isTransitioningRef.current) return null;

      const video = videoRef.current;
      if (!video || video.readyState < 2 || !video.videoWidth || !video.videoHeight) {
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

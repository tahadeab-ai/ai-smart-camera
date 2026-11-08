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
  const [isTransitioning, setIsTransitioning] = useState<boolean>(false);
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
    } catch (err) {
      console.warn('Could not enumerate video devices:', err);
    }
  }, []);

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
    setIsTransitioning(false);
    stopTracks();
    setIsActive(false);
  }, [stopTracks]);

  // Hardware camera transition (implements full 9-step lifecycle)
  const switchCamera = useCallback(
    async (nextFacingMode?: 'user' | 'environment', nextDeviceId?: string) => {
      if (isTransitioningRef.current) return;
      isTransitioningRef.current = true;
      setIsTransitioning(true);
      setError(null);

      // 1. Pause outgoing frame transmission (enforced by isTransitioningRef)
      // 2. Stop all old MediaStream tracks
      // 3. Clear old stream references
      stopTracks();

      const targetFacing = nextFacingMode ?? facingMode;
      const targetDevice = nextDeviceId !== undefined ? nextDeviceId : selectedDeviceId;

      setFacingMode(targetFacing);
      setSelectedDeviceId(targetDevice);

      // 4. Build constraints
      const buildConstraints = (useDeviceId: boolean): MediaStreamConstraints => ({
        audio: false,
        video:
          useDeviceId && targetDevice
            ? { deviceId: { exact: targetDevice }, width: { ideal: width }, height: { ideal: height } }
            : { facingMode: targetFacing, width: { ideal: width }, height: { ideal: height } },
      });

      try {
        // 5. Acquire new camera through getUserMedia
        let stream: MediaStream;
        try {
          stream = await navigator.mediaDevices.getUserMedia(buildConstraints(true));
        } catch (err: unknown) {
          // Fallback if exact deviceId constraints were overconstrained
          if (
            err instanceof DOMException &&
            (err.name === 'OverconstrainedError' || err.name === 'ConstraintNotSatisfiedError')
          ) {
            console.warn('Overconstrained deviceId, falling back to facingMode constraint...');
            stream = await navigator.mediaDevices.getUserMedia(buildConstraints(false));
          } else {
            throw err;
          }
        }

        streamRef.current = stream;

        // 6. Attach new stream to video element
        const video = videoRef.current;
        if (video) {
          video.srcObject = stream;
          // 7. Wait for video readiness
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

        // 8. Resume frame transmission
        setIsActive(true);
        await updateDevices();
      } catch (err: unknown) {
        // 9. Display errors correctly if switching fails
        const msg = err instanceof Error ? err.message : String(err);
        setError(`Camera switch error: ${msg}`);
        setIsActive(false);
        stopTracks();
      } finally {
        isTransitioningRef.current = false;
        setIsTransitioning(false);
      }
    },
    [facingMode, height, selectedDeviceId, stopTracks, updateDevices, width]
  );

  // Start video stream
  const startCamera = useCallback(async () => {
    await switchCamera(facingMode, selectedDeviceId);
  }, [facingMode, selectedDeviceId, switchCamera]);

  // Toggle front/rear camera with live hardware switching
  const toggleFacingMode = useCallback(async () => {
    const next = facingMode === 'user' ? 'environment' : 'user';
    if (isActive) {
      await switchCamera(next, '');
    } else {
      setFacingMode(next);
      setSelectedDeviceId('');
    }
  }, [facingMode, isActive, switchCamera]);

  // Select explicit device ID with live hardware switching
  const selectDevice = useCallback(
    async (deviceId: string) => {
      if (isActive) {
        await switchCamera(facingMode, deviceId);
      } else {
        setSelectedDeviceId(deviceId);
      }
    },
    [facingMode, isActive, switchCamera]
  );

  // Capture current video frame to JPEG bytes with aspect-ratio downscaling
  const captureFrameJpeg = useCallback(
    async (quality: number = 0.75, maxDimension: number = 640): Promise<Uint8Array | null> => {
      if (isTransitioningRef.current) return null;

      const video = videoRef.current;
      if (!video || video.readyState < 2 || !video.videoWidth || !video.videoHeight) {
        return null;
      }

      if (!canvasRef.current) {
        canvasRef.current = document.createElement('canvas');
      }
      const canvas = canvasRef.current;

      // Compute scaled dimensions preserving exact camera aspect ratio
      const naturalMax = Math.max(video.videoWidth, video.videoHeight);
      const scale =
        maxDimension > 0 && maxDimension < naturalMax ? maxDimension / naturalMax : 1.0;
      const targetWidth = Math.round(video.videoWidth * scale);
      const targetHeight = Math.round(video.videoHeight * scale);

      if (canvas.width !== targetWidth || canvas.height !== targetHeight) {
        canvas.width = targetWidth;
        canvas.height = targetHeight;
      }

      const ctx = canvas.getContext('2d', { alpha: false });
      if (!ctx) return null;

      ctx.drawImage(video, 0, 0, targetWidth, targetHeight);

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
    canvasRef,
    isActive,
    isTransitioning,
    facingMode,
    error,
    devices,
    selectedDeviceId,
    setSelectedDeviceId,
    startCamera,
    stopCamera,
    toggleFacingMode,
    selectDevice,
    captureFrameJpeg,
  };
}

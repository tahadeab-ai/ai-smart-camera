import React, { useEffect, useRef, useState, useCallback } from 'react';
import {
  AlertCircle,
  Play,
  RotateCcw,
  Sliders,
  Square,
  SwitchCamera,
  VideoOff,
  Sparkles,
  Gauge,
  Maximize2,
  X,
} from 'lucide-react';
import { useCamera } from '../hooks/useCamera';
import { useWebSocket } from '../hooks/useWebSocket';
import { StreamConfig, StreamMetadata, SessionAnalyticsData } from '../types';
import { LiveHUD } from './LiveHUD';

const HIGH_WATER_MARK = 64 * 1024; // 64 KB client socket backpressure threshold

export interface LiveCameraViewProps {
  onTelemetryUpdate?: (data: SessionAnalyticsData) => void;
  onStreamingStateChange?: (isStreaming: boolean) => void;
}

export const LiveCameraView: React.FC<LiveCameraViewProps> = ({
  onTelemetryUpdate,
  onStreamingStateChange,
}) => {
  // Streaming configuration with Multi-Object Tracking & image_size
  const [config, setConfig] = useState<StreamConfig>({
    confidence_threshold: 0.25,
    iou_threshold: 0.45,
    filter_classes: [],
    skip_interval: 1,
    return_annotated_frame: true,
    jpeg_quality: 75,
    enable_tracking: true,
    enable_trails: true,
    trace_length: 30,
    target_fps: 12,
    image_size: 416,
  });

  const [targetFps, setTargetFps] = useState<number>(12);
  const [maxDimension, setMaxDimension] = useState<number>(640); // 640px = 480p default
  const [filterClassInput, setFilterClassInput] = useState<string>('');
  const [annotatedFrameUrl, setAnnotatedFrameUrl] = useState<string | null>(null);
  const [aspectRatio, setAspectRatio] = useState<number>(16 / 9);
  const [fitMode, setFitMode] = useState<'contain' | 'cover'>('contain');
  const [isSettingsOpen, setIsSettingsOpen] = useState<boolean>(false);
  const [clientDropped, setClientDropped] = useState<number>(0);

  // Telemetry state
  const [telemetry, setTelemetry] = useState<StreamMetadata>({
    type: 'detection',
    frame_id: 0,
    timestamp: 0,
    latency_ms: 0,
    fps: 0,
    stats: { total_count: 0, class_counts: {}, tracked_count: 0, tracked_class_counts: {} },
    detections: [],
    skipped: false,
    dropped_frames: 0,
    queue_replacements: 0,
    queue_latency_ms: 0,
  });

  // Session accumulator state for SessionAnalyticsView
  const sessionStatsRef = useRef<{
    startTime: number;
    totalSent: number;
    processed: number;
    latencySum: number;
    fpsSum: number;
    classDist: Record<string, number>;
    maxTracked: number;
  }>({
    startTime: 0,
    totalSent: 0,
    processed: 0,
    latencySum: 0,
    fpsSum: 0,
    classDist: {},
    maxTracked: 0,
  });

  const {
    videoRef,
    isActive: isCameraActive,
    isTransitioning: isCameraTransitioning,
    facingMode,
    error: cameraError,
    startCamera,
    stopCamera,
    toggleFacingMode,
    captureFrameJpeg,
  } = useCamera({ idealFacingMode: 'user' });

  const updateTelemetryCallback = useCallback(
    (meta: StreamMetadata) => {
      setTelemetry(meta);

      const stats = sessionStatsRef.current;
      stats.processed += 1;
      stats.latencySum += meta.latency_ms;
      stats.fpsSum += meta.fps;

      const trackedCount = meta.stats.tracked_count ?? 0;
      if (trackedCount > stats.maxTracked) {
        stats.maxTracked = trackedCount;
      }

      // Aggregate class counts
      if (meta.stats.class_counts) {
        for (const [cls, count] of Object.entries(meta.stats.class_counts)) {
          stats.classDist[cls] = (stats.classDist[cls] || 0) + count;
        }
      }

      const totalDropped = (meta.dropped_frames ?? 0) + clientDropped;
      const avgLatency = stats.processed > 0 ? stats.latencySum / stats.processed : 0;
      const avgFps = stats.processed > 0 ? stats.fpsSum / stats.processed : 0;

      onTelemetryUpdate?.({
        totalFrames: stats.totalSent,
        processedFrames: stats.processed,
        droppedFrames: totalDropped,
        avgLatencyMs: avgLatency,
        avgFps: avgFps,
        classDistribution: { ...stats.classDist },
        trackedCount: trackedCount,
        maxConcurrentTracked: stats.maxTracked,
        startTime: stats.startTime,
      });
    },
    [clientDropped, onTelemetryUpdate]
  );

  const {
    isConnected: isWsConnected,
    error: wsError,
    connect: connectWs,
    disconnect: disconnectWs,
    sendFrame,
    sendConfig,
    sendResetTracker,
    getBufferedAmount,
  } = useWebSocket({
    config,
    onMetadata: updateTelemetryCallback,
    onAnnotatedFrame: (url) => setAnnotatedFrameUrl(url),
  });

  const isStreaming = isCameraActive && isWsConnected;
  const loopRef = useRef<number | null>(null);
  const isCapturingRef = useRef<boolean>(false);

  // Sync streaming state up to parent
  useEffect(() => {
    onStreamingStateChange?.(isStreaming);
  }, [isStreaming, onStreamingStateChange]);

  // Update dynamic aspect ratio when video element loads or changes stream dimensions
  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;

    const updateRatio = () => {
      if (video.videoWidth > 0 && video.videoHeight > 0) {
        setAspectRatio(video.videoWidth / video.videoHeight);
      }
    };

    video.addEventListener('loadedmetadata', updateRatio);
    video.addEventListener('resize', updateRatio);
    return () => {
      video.removeEventListener('loadedmetadata', updateRatio);
      video.removeEventListener('resize', updateRatio);
    };
  }, [videoRef]);

  // Single-flight streaming dispatch loop with backpressure protection
  useEffect(() => {
    if (!isStreaming) {
      if (loopRef.current) {
        clearInterval(loopRef.current);
        loopRef.current = null;
      }
      isCapturingRef.current = false;
      return;
    }

    const intervalMs = Math.round(1000 / targetFps);
    loopRef.current = window.setInterval(async () => {
      // 1. Single-flight guard: skip if prior capture/blob is still encoding
      if (isCapturingRef.current) {
        setClientDropped((prev) => prev + 1);
        return;
      }

      // 2. High-water mark guard: skip if browser socket queue is congested (>64KB)
      if (getBufferedAmount() > HIGH_WATER_MARK) {
        setClientDropped((prev) => prev + 1);
        return;
      }

      isCapturingRef.current = true;
      try {
        const jpegBytes = await captureFrameJpeg(config.jpeg_quality / 100, maxDimension);
        if (jpegBytes) {
          sessionStatsRef.current.totalSent += 1;
          sendFrame(jpegBytes);
        }
      } finally {
        isCapturingRef.current = false;
      }
    }, intervalMs);

    return () => {
      if (loopRef.current) {
        clearInterval(loopRef.current);
        loopRef.current = null;
      }
      isCapturingRef.current = false;
    };
  }, [captureFrameJpeg, config.jpeg_quality, getBufferedAmount, isStreaming, maxDimension, sendFrame, targetFps]);

  const handleStart = async () => {
    setClientDropped(0);
    sessionStatsRef.current = {
      startTime: Date.now(),
      totalSent: 0,
      processed: 0,
      latencySum: 0,
      fpsSum: 0,
      classDist: {},
      maxTracked: 0,
    };
    await startCamera();
    connectWs();
  };

  const handleStop = () => {
    stopCamera();
    disconnectWs();
    setAnnotatedFrameUrl(null);
    setClientDropped(0);
  };

  // Deterministic camera switch: reset backend tracker before hardware flips
  const handleToggleFacingMode = async () => {
    if (isStreaming) {
      sendResetTracker();
      setClientDropped(0);
    }
    await toggleFacingMode();
  };

  const handleConfigChange = (changes: Partial<StreamConfig>) => {
    const updated = { ...config, ...changes };
    setConfig(updated);
    sendConfig(changes);
  };

  const handleApplyClassFilter = () => {
    const classes = filterClassInput
      .split(',')
      .map((c) => c.trim())
      .filter(Boolean);
    handleConfigChange({ filter_classes: classes });
  };

  const handleResetTracker = () => {
    sendResetTracker();
    setClientDropped(0);
  };

  const toggleFitMode = () => {
    setFitMode((prev) => (prev === 'contain' ? 'cover' : 'contain'));
  };

  return (
    <div className="relative w-full h-[calc(100vh-8.5rem)] md:h-[calc(100vh-5.5rem)] flex flex-col justify-between overflow-hidden">
      {/* Main Full-Bleed Viewport Container */}
      <div className="relative flex-1 w-full bg-slate-950 border border-slate-800/80 rounded-2xl md:rounded-3xl overflow-hidden shadow-2xl flex items-center justify-center">
        {/* Aspect Ratio Controlled Inner Frame */}
        <div
          className={`relative w-full h-full flex items-center justify-center overflow-hidden transition-all duration-300 ${
            fitMode === 'cover' ? 'h-full' : ''
          }`}
          style={
            fitMode === 'contain' && aspectRatio > 0
              ? { maxHeight: '100%', maxWidth: '100%', aspectRatio: `${aspectRatio}` }
              : { width: '100%', height: '100%' }
          }
        >
          {/* Hardware video preview (underlay) */}
          <video
            ref={videoRef}
            playsInline
            muted
            className={`absolute inset-0 w-full h-full pointer-events-none transition-opacity duration-150 ${
              fitMode === 'cover' ? 'object-cover' : 'object-contain'
            } ${annotatedFrameUrl ? 'opacity-0' : 'opacity-100'}`}
          />

          {/* Server-annotated stream with boxes, IDs, and motion trails */}
          {annotatedFrameUrl && (
            <img
              src={annotatedFrameUrl}
              alt="AI Smart Camera Real-Time Feed"
              className={`absolute inset-0 w-full h-full select-none pointer-events-none ${
                fitMode === 'cover' ? 'object-cover' : 'object-contain'
              }`}
            />
          )}

          {/* Inactive Standby Viewport Display */}
          {!isStreaming && (
            <div className="flex flex-col items-center justify-center text-slate-500 space-y-4 z-10 p-6 text-center select-none animate-fade-in">
              <div className="p-5 bg-slate-900/90 border border-slate-800 rounded-3xl text-slate-400 shadow-xl shadow-slate-950/60">
                <VideoOff className="w-10 h-10 sm:w-12 sm:h-12 text-slate-400" />
              </div>
              <div className="max-w-md">
                <h3 className="text-base sm:text-lg font-bold text-slate-200">
                  Camera Feed Ready
                </h3>
                <p className="text-xs sm:text-sm text-slate-400 mt-1.5 leading-relaxed">
                  Start the camera to begin streaming to the real-time YOLO & ByteTrack engine.
                </p>
              </div>
            </div>
          )}

          {/* Live Floating HUD Overlay */}
          <LiveHUD
            isStreaming={isStreaming}
            frameId={telemetry.frame_id}
            fps={telemetry.fps}
            latencyMs={telemetry.latency_ms}
            queueLatencyMs={telemetry.queue_latency_ms ?? 0}
            droppedFrames={telemetry.dropped_frames ?? 0}
            clientDropped={clientDropped}
            trackedCount={telemetry.stats.tracked_count ?? 0}
            totalCount={telemetry.stats.total_count}
            classCounts={telemetry.stats.class_counts}
            fitMode={fitMode}
            onToggleFitMode={toggleFitMode}
            facingMode={facingMode}
            imageSize={config.image_size ?? 416}
            aspectRatio={aspectRatio}
            trackingEnabled={config.enable_tracking ?? true}
          />
        </div>

        {/* Error Notices Toast */}
        {(cameraError || wsError) && (
          <div className="absolute top-14 left-4 right-4 sm:left-auto sm:right-4 z-30 max-w-md p-3 bg-rose-950/90 border border-rose-600/40 rounded-xl text-rose-300 text-xs flex items-center space-x-2.5 backdrop-blur-md shadow-2xl animate-fade-in">
            <AlertCircle className="w-4 h-4 flex-shrink-0 text-rose-400" />
            <span className="flex-1 font-medium">{cameraError || wsError}</span>
          </div>
        )}
      </div>

      {/* Floating Bottom Action Toolbar */}
      <div className="flex items-center justify-between gap-2 px-2 pt-2.5 sm:pt-3 z-20">
        {/* Left: Settings Trigger */}
        <button
          onClick={() => setIsSettingsOpen(true)}
          className="flex items-center space-x-1.5 px-3.5 py-2.5 sm:py-3 rounded-2xl bg-slate-900/90 hover:bg-slate-800 text-slate-200 border border-slate-800 shadow-xl backdrop-blur-md transition active:scale-95 text-xs sm:text-sm font-medium"
        >
          <Sliders className="w-4 h-4 text-sky-400" />
          <span className="hidden sm:inline">Settings</span>
        </button>

        {/* Center: Main Primary Start/Stop Pill & Flip */}
        <div className="flex items-center space-x-2">
          {!isStreaming ? (
            <button
              onClick={handleStart}
              className="flex items-center space-x-2 px-6 sm:px-8 py-2.5 sm:py-3 rounded-2xl bg-gradient-to-r from-emerald-600 to-teal-500 hover:from-emerald-500 hover:to-teal-400 active:scale-95 text-white font-semibold shadow-lg shadow-emerald-950/60 transition text-xs sm:text-sm"
            >
              <Play className="w-4 h-4 fill-current" />
              <span>Start Stream</span>
            </button>
          ) : (
            <button
              onClick={handleStop}
              className="flex items-center space-x-2 px-6 sm:px-8 py-2.5 sm:py-3 rounded-2xl bg-gradient-to-r from-rose-600 to-red-500 hover:from-rose-500 hover:to-red-400 active:scale-95 text-white font-semibold shadow-lg shadow-rose-950/60 transition text-xs sm:text-sm"
            >
              <Square className="w-4 h-4 fill-current" />
              <span>Stop Stream</span>
            </button>
          )}

          {/* Camera Flip Button */}
          <button
            onClick={handleToggleFacingMode}
            disabled={isCameraTransitioning}
            title="Switch Front/Rear Camera"
            className="p-2.5 sm:p-3 rounded-2xl bg-slate-900/90 hover:bg-slate-800 active:scale-95 disabled:opacity-50 text-slate-200 border border-slate-800 shadow-xl backdrop-blur-md transition"
            aria-label="Flip Camera"
          >
            <SwitchCamera
              className={`w-4 h-4 text-sky-400 ${isCameraTransitioning ? 'animate-spin' : ''}`}
            />
          </button>
        </div>

        {/* Right: Quick Tracker Reset & Aspect Toggle */}
        <div className="flex items-center space-x-1.5">
          {isStreaming && (
            <button
              onClick={handleResetTracker}
              title="Reset ByteTrack IDs"
              className="flex items-center space-x-1 p-2.5 sm:px-3 sm:py-2.5 rounded-2xl bg-slate-900/90 hover:bg-slate-800 text-indigo-300 border border-slate-800 shadow-xl backdrop-blur-md transition active:scale-95 text-xs font-mono"
            >
              <RotateCcw className="w-4 h-4 text-indigo-400" />
              <span className="hidden md:inline">Reset</span>
            </button>
          )}

          <button
            onClick={toggleFitMode}
            title={fitMode === 'contain' ? 'Cover viewport' : 'Fit aspect ratio'}
            className="p-2.5 sm:p-3 rounded-2xl bg-slate-900/90 hover:bg-slate-800 text-slate-300 hover:text-white border border-slate-800 shadow-xl backdrop-blur-md transition active:scale-95"
          >
            <Maximize2 className="w-4 h-4 text-slate-400" />
          </button>
        </div>
      </div>

      {/* Settings Bottom Sheet Drawer */}
      {isSettingsOpen && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4 bg-slate-950/80 backdrop-blur-sm animate-fade-in">
          <div
            className="relative w-full max-w-xl max-h-[85vh] overflow-y-auto bg-slate-900 border border-slate-800 rounded-t-3xl sm:rounded-3xl shadow-2xl p-5 space-y-4"
            role="dialog"
            aria-modal="true"
          >
            {/* Drawer Header */}
            <div className="flex items-center justify-between pb-3 border-b border-slate-800">
              <div className="flex items-center space-x-2 text-white font-bold text-sm sm:text-base">
                <Sparkles className="w-4 h-4 text-sky-400" />
                <span>Vision & Pipeline Tuning</span>
              </div>
              <button
                onClick={() => setIsSettingsOpen(false)}
                className="p-1 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Section: Stream Resolution & YOLO Input Size */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 bg-slate-950/60 border border-slate-800/80 rounded-2xl p-3.5">
              {/* Transmission Resolution */}
              <div className="space-y-1.5">
                <div className="flex justify-between items-center text-xs">
                  <span className="text-slate-300 font-semibold flex items-center space-x-1">
                    <Maximize2 className="w-3.5 h-3.5 text-sky-400" />
                    <span>Upload Scale</span>
                  </span>
                  <span className="text-sky-400 font-mono font-bold">
                    {maxDimension === 480 ? '360p' : maxDimension === 640 ? '480p' : maxDimension === 1280 ? '720p' : 'Raw'}
                  </span>
                </div>
                <div className="grid grid-cols-4 gap-1">
                  {[
                    { label: '360p', val: 480 },
                    { label: '480p', val: 640 },
                    { label: '720p', val: 1280 },
                    { label: 'Raw', val: 0 },
                  ].map((item) => (
                    <button
                      key={item.label}
                      onClick={() => setMaxDimension(item.val)}
                      className={`py-1.5 text-xs font-mono font-semibold rounded-xl border transition ${
                        maxDimension === item.val
                          ? 'bg-sky-600 text-white border-sky-500 shadow-md'
                          : 'bg-slate-800 text-slate-300 border-slate-700 hover:bg-slate-700'
                      }`}
                    >
                      {item.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* YOLO Input Size */}
              <div className="space-y-1.5">
                <div className="flex justify-between items-center text-xs">
                  <span className="text-slate-300 font-semibold flex items-center space-x-1">
                    <Gauge className="w-3.5 h-3.5 text-emerald-400" />
                    <span>Model Size</span>
                  </span>
                  <span className="text-emerald-400 font-mono font-bold">
                    {config.image_size ?? 416}px
                  </span>
                </div>
                <div className="grid grid-cols-3 gap-1">
                  {[416, 512, 640].map((sz) => (
                    <button
                      key={sz}
                      onClick={() => handleConfigChange({ image_size: sz })}
                      className={`py-1.5 text-xs font-mono font-semibold rounded-xl border transition ${
                        (config.image_size ?? 416) === sz
                          ? 'bg-emerald-600 text-white border-emerald-500 shadow-md'
                          : 'bg-slate-800 text-slate-300 border-slate-700 hover:bg-slate-700'
                      }`}
                    >
                      {sz}px
                    </button>
                  ))}
                </div>
              </div>
            </div>

            {/* Section: Tracking & Motion Trails */}
            <div className="bg-slate-950/60 border border-slate-800/80 rounded-2xl p-3.5 space-y-3 text-xs">
              <div className="flex items-center justify-between">
                <div>
                  <span className="font-semibold text-white block">Multi-Object Tracking (ByteTrack)</span>
                  <span className="text-[11px] text-slate-400">Keep persistent ID numbers across frames</span>
                </div>
                <input
                  type="checkbox"
                  checked={config.enable_tracking ?? true}
                  onChange={(e) => handleConfigChange({ enable_tracking: e.target.checked })}
                  className="w-4 h-4 accent-sky-500 rounded cursor-pointer"
                />
              </div>

              {config.enable_tracking && (
                <>
                  <div className="flex items-center justify-between pt-2 border-t border-slate-800/60">
                    <div>
                      <span className="text-slate-300 font-medium block">Motion Trails</span>
                      <span className="text-[11px] text-slate-400">Render supervision trace trajectories</span>
                    </div>
                    <input
                      type="checkbox"
                      checked={config.enable_trails ?? true}
                      onChange={(e) => handleConfigChange({ enable_trails: e.target.checked })}
                      className="w-4 h-4 accent-sky-500 rounded cursor-pointer"
                    />
                  </div>

                  {config.enable_trails && (
                    <div className="space-y-1 pt-2 border-t border-slate-800/60">
                      <div className="flex justify-between">
                        <span className="text-slate-400">Trail Length</span>
                        <span className="text-sky-400 font-mono font-bold">{config.trace_length ?? 30} frames</span>
                      </div>
                      <input
                        type="range"
                        min="10"
                        max="60"
                        step="5"
                        value={config.trace_length ?? 30}
                        onChange={(e) => handleConfigChange({ trace_length: parseInt(e.target.value, 10) })}
                        className="w-full accent-sky-500 bg-slate-800 rounded-lg h-2 cursor-pointer"
                      />
                    </div>
                  )}
                </>
              )}
            </div>

            {/* Section: Detection Thresholds */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
              {/* Confidence Slider */}
              <div className="bg-slate-950/60 border border-slate-800/80 rounded-2xl p-3.5 space-y-1.5">
                <div className="flex justify-between">
                  <span className="text-slate-300 font-medium">Confidence</span>
                  <span className="text-sky-400 font-mono font-bold">
                    {Math.round(config.confidence_threshold * 100)}%
                  </span>
                </div>
                <input
                  type="range"
                  min="0.05"
                  max="0.95"
                  step="0.05"
                  value={config.confidence_threshold}
                  onChange={(e) =>
                    handleConfigChange({ confidence_threshold: parseFloat(e.target.value) })
                  }
                  className="w-full accent-sky-500 bg-slate-800 rounded-lg h-2 cursor-pointer"
                />
              </div>

              {/* IoU Threshold Slider */}
              <div className="bg-slate-950/60 border border-slate-800/80 rounded-2xl p-3.5 space-y-1.5">
                <div className="flex justify-between">
                  <span className="text-slate-300 font-medium">NMS IoU</span>
                  <span className="text-sky-400 font-mono font-bold">
                    {Math.round(config.iou_threshold * 100)}%
                  </span>
                </div>
                <input
                  type="range"
                  min="0.10"
                  max="0.90"
                  step="0.05"
                  value={config.iou_threshold}
                  onChange={(e) =>
                    handleConfigChange({ iou_threshold: parseFloat(e.target.value) })
                  }
                  className="w-full accent-sky-500 bg-slate-800 rounded-lg h-2 cursor-pointer"
                />
              </div>
            </div>

            {/* Section: Decimation & FPS */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
              <div className="bg-slate-950/60 border border-slate-800/80 rounded-2xl p-3.5 space-y-1.5">
                <div className="flex justify-between">
                  <span className="text-slate-300 font-medium">Skip Interval</span>
                  <span className="text-emerald-400 font-mono font-semibold">
                    {config.skip_interval === 1 ? '1x (All)' : `${config.skip_interval}x`}
                  </span>
                </div>
                <div className="grid grid-cols-4 gap-1">
                  {[1, 2, 3, 4].map((n) => (
                    <button
                      key={n}
                      onClick={() => handleConfigChange({ skip_interval: n })}
                      className={`py-1 text-xs font-mono font-semibold rounded-lg border transition ${
                        config.skip_interval === n
                          ? 'bg-sky-600 text-white border-sky-500'
                          : 'bg-slate-800 text-slate-300 border-slate-700 hover:bg-slate-700'
                      }`}
                    >
                      {n === 1 ? '1x' : `${n}x`}
                    </button>
                  ))}
                </div>
              </div>

              <div className="bg-slate-950/60 border border-slate-800/80 rounded-2xl p-3.5 space-y-1.5">
                <div className="flex justify-between">
                  <span className="text-slate-300 font-medium">Target FPS</span>
                  <span className="text-sky-400 font-mono font-bold">{targetFps} FPS</span>
                </div>
                <div className="grid grid-cols-4 gap-1">
                  {[6, 12, 18, 24].map((fps) => (
                    <button
                      key={fps}
                      onClick={() => setTargetFps(fps)}
                      className={`py-1 text-xs font-mono font-semibold rounded-lg border transition ${
                        targetFps === fps
                          ? 'bg-sky-600 text-white border-sky-500'
                          : 'bg-slate-800 text-slate-300 border-slate-700 hover:bg-slate-700'
                      }`}
                    >
                      {fps}
                    </button>
                  ))}
                </div>
              </div>
            </div>

            {/* Section: Class Filter */}
            <div className="bg-slate-950/60 border border-slate-800/80 rounded-2xl p-3.5 space-y-2 text-xs">
              <label className="text-slate-300 font-medium block">Filter Classes</label>
              <div className="flex space-x-2">
                <input
                  type="text"
                  placeholder="e.g. person, car, dog"
                  value={filterClassInput}
                  onChange={(e) => setFilterClassInput(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && handleApplyClassFilter()}
                  className="flex-1 bg-slate-800 border border-slate-700 text-slate-200 text-xs px-3 py-2 rounded-xl focus:outline-none focus:border-sky-500"
                />
                <button
                  onClick={handleApplyClassFilter}
                  className="bg-sky-600 hover:bg-sky-500 text-white text-xs px-4 py-2 rounded-xl font-semibold transition"
                >
                  Filter
                </button>
              </div>
              {config.filter_classes.length > 0 && (
                <div className="flex flex-wrap gap-1.5 mt-2">
                  {config.filter_classes.map((cls) => (
                    <span
                      key={cls}
                      className="inline-flex items-center space-x-1 text-xs bg-sky-950/80 text-sky-300 border border-sky-800/80 px-2.5 py-0.5 rounded-lg"
                    >
                      <span>{cls}</span>
                      <button
                        onClick={() =>
                          handleConfigChange({
                            filter_classes: config.filter_classes.filter((c) => c !== cls),
                          })
                        }
                        className="hover:text-rose-400 ml-1 font-bold"
                      >
                        &times;
                      </button>
                    </span>
                  ))}
                </div>
              )}
            </div>

            {/* Close Button */}
            <div className="pt-2">
              <button
                onClick={() => setIsSettingsOpen(false)}
                className="w-full py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 font-semibold text-xs transition"
              >
                Close Settings
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

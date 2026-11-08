import React, { useEffect, useRef, useState } from 'react';
import {
  AlertCircle,
  Play,
  RotateCcw,
  Sliders,
  Square,
  SwitchCamera,
  VideoOff,
  ChevronDown,
  ChevronUp,
  Crosshair,
  Sparkles,
} from 'lucide-react';
import { useCamera } from '../hooks/useCamera';
import { useWebSocket } from '../hooks/useWebSocket';
import { StreamConfig, StreamMetadata } from '../types';
import { MetricsBar } from './MetricsBar';

export const LiveCameraView: React.FC = () => {
  // Streaming configuration with full Multi-Object Tracking support
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
  });

  const [targetFps, setTargetFps] = useState<number>(12);
  const [filterClassInput, setFilterClassInput] = useState<string>('');
  const [annotatedFrameUrl, setAnnotatedFrameUrl] = useState<string | null>(null);
  const [aspectRatio, setAspectRatio] = useState<number>(16 / 9);
  const [isSettingsOpen, setIsSettingsOpen] = useState<boolean>(false);

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

  const {
    isConnected: isWsConnected,
    error: wsError,
    connect: connectWs,
    disconnect: disconnectWs,
    sendFrame,
    sendConfig,
    sendResetTracker,
  } = useWebSocket({
    config,
    onMetadata: (meta) => setTelemetry(meta),
    onAnnotatedFrame: (url) => setAnnotatedFrameUrl(url),
  });

  const isStreaming = isCameraActive && isWsConnected;
  const loopRef = useRef<number | null>(null);

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

  // Streaming dispatch loop
  useEffect(() => {
    if (!isStreaming) {
      if (loopRef.current) {
        clearInterval(loopRef.current);
        loopRef.current = null;
      }
      return;
    }

    const intervalMs = Math.round(1000 / targetFps);
    loopRef.current = window.setInterval(async () => {
      const jpegBytes = await captureFrameJpeg(config.jpeg_quality / 100);
      if (jpegBytes) {
        sendFrame(jpegBytes);
      }
    }, intervalMs);

    return () => {
      if (loopRef.current) {
        clearInterval(loopRef.current);
        loopRef.current = null;
      }
    };
  }, [captureFrameJpeg, config.jpeg_quality, isStreaming, sendFrame, targetFps]);

  const handleStart = async () => {
    await startCamera();
    connectWs();
  };

  const handleStop = () => {
    stopCamera();
    disconnectWs();
    setAnnotatedFrameUrl(null);
  };

  // Deterministic camera switch: reset backend tracker before hardware flips
  const handleToggleFacingMode = async () => {
    if (isStreaming) {
      sendResetTracker();
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
  };

  return (
    <div className="space-y-4 max-w-5xl mx-auto">
      {/* Real-time KPI Bar */}
      <MetricsBar
        fps={telemetry.fps}
        latencyMs={telemetry.latency_ms}
        totalCount={telemetry.stats.total_count}
        classCounts={telemetry.stats.class_counts}
        trackedCount={telemetry.stats.tracked_count}
        trackedClassCounts={telemetry.stats.tracked_class_counts}
        skipped={telemetry.skipped}
        isStreaming={isStreaming}
      />

      {/* Main Responsive Viewport Container */}
      <div className="relative w-full bg-slate-900 border border-slate-800 rounded-2xl overflow-hidden shadow-2xl flex items-center justify-center">
        <div
          className="relative w-full max-h-[75vh] flex items-center justify-center overflow-hidden transition-all duration-300"
          style={{ aspectRatio: `${aspectRatio}` }}
        >
          {/* Hardware video preview (underlay) */}
          <video
            ref={videoRef}
            playsInline
            muted
            className={`absolute inset-0 w-full h-full object-contain pointer-events-none ${
              annotatedFrameUrl ? 'opacity-0' : 'opacity-100'
            }`}
          />

          {/* Server-annotated stream with boxes, IDs, and motion trails */}
          {annotatedFrameUrl && (
            <img
              src={annotatedFrameUrl}
              alt="AI Smart Camera Real-Time Feed"
              className="absolute inset-0 w-full h-full object-contain select-none pointer-events-none"
            />
          )}

          {/* Inactive Standby Viewport Display */}
          {!isStreaming && (
            <div className="flex flex-col items-center justify-center text-slate-500 space-y-3 z-10 p-6 text-center">
              <div className="p-4 bg-slate-800/80 border border-slate-700/80 rounded-full text-slate-400">
                <VideoOff className="w-8 h-8 sm:w-10 sm:h-10" />
              </div>
              <div>
                <h3 className="text-sm sm:text-base font-semibold text-slate-300">
                  Camera Feed Inactive
                </h3>
                <p className="text-xs text-slate-500 max-w-sm mt-1">
                  Tap "Start Camera" below to grant browser webcam permissions and launch isolated multi-object tracking.
                </p>
              </div>
            </div>
          )}

          {/* Stream Status Overlay Badge (Top Left) */}
          <div className="absolute top-2.5 left-2.5 flex items-center space-x-1.5 z-20">
            <span
              className={`px-2.5 py-1 rounded-full text-[11px] sm:text-xs font-mono font-semibold flex items-center space-x-1.5 backdrop-blur-md shadow-md ${
                isStreaming
                  ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30'
                  : 'bg-slate-900/80 text-slate-400 border border-slate-700'
              }`}
            >
              <span
                className={`w-2 h-2 rounded-full ${
                  isStreaming ? 'bg-emerald-400 animate-pulse' : 'bg-slate-500'
                }`}
              />
              <span>{isStreaming ? 'LIVE' : 'STANDBY'}</span>
            </span>

            {isStreaming && (
              <span className="px-2 py-0.5 bg-slate-900/80 backdrop-blur-md border border-slate-700 text-slate-300 text-[10px] sm:text-xs font-mono rounded-full">
                #{telemetry.frame_id}
              </span>
            )}
          </div>

          {/* Facing Mode & Tracking Pill (Top Right) */}
          <div className="absolute top-2.5 right-2.5 flex items-center space-x-1.5 z-20">
            {config.enable_tracking && (
              <span className="hidden xs:flex items-center space-x-1 px-2 py-0.5 bg-indigo-950/80 backdrop-blur-md border border-indigo-700/80 text-indigo-300 text-[10px] sm:text-xs font-mono rounded-full">
                <Crosshair className="w-3 h-3 text-indigo-400" />
                <span>ByteTrack</span>
              </span>
            )}

            {isCameraActive && (
              <span className="px-2.5 py-0.5 bg-slate-900/80 backdrop-blur-md border border-slate-700 text-sky-400 text-[10px] sm:text-xs font-mono rounded-full capitalize">
                {facingMode === 'user' ? 'Front' : 'Rear'}
              </span>
            )}
          </div>
        </div>
      </div>

      {/* Error Notices */}
      {(cameraError || wsError) && (
        <div className="p-3 bg-rose-500/10 border border-rose-500/30 rounded-xl text-rose-300 text-xs flex items-center space-x-2">
          <AlertCircle className="w-4 h-4 flex-shrink-0 text-rose-400" />
          <span>{cameraError || wsError}</span>
        </div>
      )}

      {/* Primary Action Toolbar */}
      <div className="flex flex-wrap items-center gap-2 sm:gap-3">
        {!isStreaming ? (
          <button
            onClick={handleStart}
            className="flex-1 min-w-[140px] flex items-center justify-center space-x-2 bg-sky-600 hover:bg-sky-500 active:scale-[0.98] text-white font-medium py-2.5 sm:py-3 px-4 rounded-xl shadow-lg shadow-sky-600/30 transition text-sm"
          >
            <Play className="w-4 h-4 fill-current" />
            <span>Start Camera</span>
          </button>
        ) : (
          <button
            onClick={handleStop}
            className="flex-1 min-w-[140px] flex items-center justify-center space-x-2 bg-rose-600 hover:bg-rose-500 active:scale-[0.98] text-white font-medium py-2.5 sm:py-3 px-4 rounded-xl shadow-lg shadow-rose-600/30 transition text-sm"
          >
            <Square className="w-4 h-4 fill-current" />
            <span>Stop Camera</span>
          </button>
        )}

        <button
          onClick={handleToggleFacingMode}
          disabled={isCameraTransitioning}
          title="Switch Front/Rear Camera (Mobile)"
          className="flex items-center space-x-1.5 bg-slate-800 hover:bg-slate-700 active:scale-[0.98] disabled:opacity-50 text-slate-200 border border-slate-700 py-2.5 sm:py-3 px-3.5 rounded-xl transition text-sm"
        >
          <SwitchCamera
            className={`w-4 h-4 text-sky-400 ${isCameraTransitioning ? 'animate-spin' : ''}`}
          />
          <span className="hidden sm:inline">
            {isCameraTransitioning ? 'Flipping...' : 'Flip Camera'}
          </span>
        </button>

        {isStreaming && (
          <button
            onClick={handleResetTracker}
            title="Reset ByteTrack Multi-Object Tracking State"
            className="flex items-center space-x-1.5 bg-slate-800 hover:bg-slate-700 active:scale-[0.98] text-slate-200 border border-slate-700 py-2.5 sm:py-3 px-3.5 rounded-xl transition text-sm"
          >
            <RotateCcw className="w-4 h-4 text-indigo-400" />
            <span className="hidden sm:inline">Reset Tracker</span>
          </button>
        )}

        <button
          onClick={() => setIsSettingsOpen(!isSettingsOpen)}
          className={`flex items-center space-x-1.5 py-2.5 sm:py-3 px-3.5 rounded-xl border transition text-sm ${
            isSettingsOpen
              ? 'bg-sky-600/20 text-sky-300 border-sky-500/40'
              : 'bg-slate-800 hover:bg-slate-700 text-slate-200 border-slate-700'
          }`}
        >
          <Sliders className="w-4 h-4 text-sky-400" />
          <span className="text-xs sm:text-sm font-medium">Settings</span>
          {isSettingsOpen ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
        </button>
      </div>

      {/* Collapsible Parameters Drawer */}
      {isSettingsOpen && (
        <div className="bg-slate-900/95 border border-slate-800 rounded-2xl p-4 sm:p-5 space-y-5 animate-fade-in">
          {/* Header */}
          <div className="flex items-center justify-between pb-3 border-b border-slate-800 text-sm">
            <div className="flex items-center space-x-2 text-white font-semibold">
              <Sparkles className="w-4 h-4 text-sky-400" />
              <span>Vision & Tracking Parameters</span>
            </div>
            {isStreaming && (
              <button
                onClick={handleResetTracker}
                className="text-xs text-indigo-400 hover:text-indigo-300 flex items-center space-x-1"
              >
                <RotateCcw className="w-3.5 h-3.5" />
                <span>Reset Tracker</span>
              </button>
            )}
          </div>

          {/* Section: Tracking Controls */}
          <div className="bg-slate-950/60 border border-slate-800/80 rounded-xl p-3.5 space-y-3">
            <div className="flex items-center justify-between">
              <div>
                <span className="text-xs font-semibold text-white block">Multi-Object Tracking (ByteTrack)</span>
                <span className="text-[11px] text-slate-400">Assign persistent ID numbers across consecutive frames</span>
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
                    <span className="text-xs font-medium text-slate-300 block">Motion Trails</span>
                    <span className="text-[11px] text-slate-400">Render supervision trace trajectory lines</span>
                  </div>
                  <input
                    type="checkbox"
                    checked={config.enable_trails ?? true}
                    onChange={(e) => handleConfigChange({ enable_trails: e.target.checked })}
                    className="w-4 h-4 accent-sky-500 rounded cursor-pointer"
                  />
                </div>

                {config.enable_trails && (
                  <div className="space-y-1.5 pt-2 border-t border-slate-800/60">
                    <div className="flex justify-between text-xs">
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
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {/* Confidence Slider */}
            <div className="space-y-1.5">
              <div className="flex justify-between text-xs">
                <span className="text-slate-400 font-medium">Confidence Threshold</span>
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
            <div className="space-y-1.5">
              <div className="flex justify-between text-xs">
                <span className="text-slate-400 font-medium">NMS IoU Threshold</span>
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

          {/* Section: Frame Decimation & Capture Rate */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {/* Decimation Interval */}
            <div className="space-y-1.5">
              <div className="flex justify-between text-xs">
                <span className="text-slate-400 font-medium">Decimation Interval</span>
                <span className="text-emerald-400 font-mono font-semibold">
                  {config.skip_interval === 1 ? 'Every Frame (1x)' : `Every ${config.skip_interval}th Frame`}
                </span>
              </div>
              <div className="grid grid-cols-4 gap-1.5">
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

            {/* Capture Rate */}
            <div className="space-y-1.5">
              <div className="flex justify-between text-xs">
                <span className="text-slate-400 font-medium">Capture Rate</span>
                <span className="text-sky-400 font-mono font-bold">{targetFps} FPS</span>
              </div>
              <div className="grid grid-cols-4 gap-1.5">
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
          <div className="space-y-2">
            <label className="text-xs text-slate-400 font-medium block">Class Filter (Optional)</label>
            <div className="flex space-x-2">
              <input
                type="text"
                placeholder="e.g. person, dog, cell phone"
                value={filterClassInput}
                onChange={(e) => setFilterClassInput(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleApplyClassFilter()}
                className="flex-1 bg-slate-800 border border-slate-700 text-slate-200 text-xs px-3 py-2 rounded-lg focus:outline-none focus:border-sky-500"
              />
              <button
                onClick={handleApplyClassFilter}
                className="bg-slate-800 hover:bg-slate-700 text-sky-400 border border-slate-700 text-xs px-3 py-2 rounded-lg font-medium transition"
              >
                Apply
              </button>
            </div>
            {config.filter_classes.length > 0 && (
              <div className="flex flex-wrap gap-1 mt-1.5">
                {config.filter_classes.map((cls) => (
                  <span
                    key={cls}
                    className="inline-flex items-center space-x-1 text-[11px] bg-sky-950/60 text-sky-300 border border-sky-800/80 px-2 py-0.5 rounded"
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
        </div>
      )}
    </div>
  );
};

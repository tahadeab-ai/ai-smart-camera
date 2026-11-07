import React, { useEffect, useRef, useState } from 'react';
import {
  AlertCircle,
  Play,
  Sliders,
  Square,
  SwitchCamera,
  VideoOff,
} from 'lucide-react';
import { useCamera } from '../hooks/useCamera';
import { useWebSocket } from '../hooks/useWebSocket';
import { StreamConfig, StreamMetadata } from '../types';
import { MetricsBar } from './MetricsBar';

export const LiveCameraView: React.FC = () => {
  // Streaming configuration
  const [config, setConfig] = useState<StreamConfig>({
    confidence_threshold: 0.25,
    iou_threshold: 0.45,
    filter_classes: [],
    skip_interval: 1,
    return_annotated_frame: true,
    jpeg_quality: 75,
  });

  const [targetFps, setTargetFps] = useState<number>(12);
  const [filterClassInput, setFilterClassInput] = useState<string>('');
  const [annotatedFrameUrl, setAnnotatedFrameUrl] = useState<string | null>(null);

  // Telemetry state
  const [telemetry, setTelemetry] = useState<StreamMetadata>({
    type: 'detection',
    frame_id: 0,
    timestamp: 0,
    latency_ms: 0,
    fps: 0,
    stats: { total_count: 0, class_counts: {} },
    detections: [],
    skipped: false,
  });

  const {
    videoRef,
    isActive: isCameraActive,
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
  } = useWebSocket({
    config,
    onMetadata: (meta) => setTelemetry(meta),
    onAnnotatedFrame: (url) => setAnnotatedFrameUrl(url),
  });

  const isStreaming = isCameraActive && isWsConnected;
  const loopRef = useRef<number | null>(null);

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

  return (
    <div className="space-y-6">
      {/* Real-time KPI Bar */}
      <MetricsBar
        fps={telemetry.fps}
        latencyMs={telemetry.latency_ms}
        totalCount={telemetry.stats.total_count}
        classCounts={telemetry.stats.class_counts}
        skipped={telemetry.skipped}
      />

      {/* Main Video Viewport & Controls */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Camera Display Viewport (2 Cols on lg) */}
        <div className="lg:col-span-2 space-y-4">
          <div className="relative aspect-video bg-slate-900 border border-slate-800 rounded-2xl overflow-hidden shadow-2xl flex items-center justify-center">
            {/* Raw video element (hidden or active if stream is pending) */}
            <video
              ref={videoRef}
              playsInline
              muted
              className={`absolute inset-0 w-full h-full object-contain ${
                annotatedFrameUrl ? 'opacity-0' : 'opacity-100'
              }`}
            />

            {/* Server-annotated live frame */}
            {annotatedFrameUrl && (
              <img
                src={annotatedFrameUrl}
                alt="AI Camera Feed"
                className="absolute inset-0 w-full h-full object-contain select-none"
              />
            )}

            {/* Inactive State Display */}
            {!isStreaming && (
              <div className="flex flex-col items-center justify-center text-slate-500 space-y-3 z-10 p-6 text-center">
                <div className="p-4 bg-slate-800/80 border border-slate-700/80 rounded-full text-slate-400">
                  <VideoOff className="w-10 h-10" />
                </div>
                <div>
                  <h3 className="text-base font-semibold text-slate-300">Camera Inactive</h3>
                  <p className="text-xs text-slate-500 max-w-sm mt-1">
                    Tap "Start Live Stream" below to request browser camera permissions and begin real-time object detection.
                  </p>
                </div>
              </div>
            )}

            {/* Stream Status Overlay Badge */}
            <div className="absolute top-3 left-3 flex items-center space-x-2 z-20">
              <span
                className={`px-2.5 py-1 rounded-full text-xs font-mono font-semibold flex items-center space-x-1.5 backdrop-blur ${
                  isStreaming
                    ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30'
                    : 'bg-slate-800/80 text-slate-400 border border-slate-700'
                }`}
              >
                <span
                  className={`w-2 h-2 rounded-full ${
                    isStreaming ? 'bg-emerald-400 animate-pulse' : 'bg-slate-500'
                  }`}
                />
                <span>{isStreaming ? 'STREAMING' : 'IDLE'}</span>
              </span>

              {isStreaming && (
                <span className="px-2 py-1 bg-slate-900/80 backdrop-blur border border-slate-700 text-slate-300 text-xs font-mono rounded-full">
                  Frame #{telemetry.frame_id}
                </span>
              )}
            </div>

            {/* Facing Mode Pill */}
            {isCameraActive && (
              <div className="absolute top-3 right-3 z-20">
                <span className="px-2.5 py-1 bg-slate-900/80 backdrop-blur border border-slate-700 text-sky-400 text-xs font-mono rounded-full capitalize">
                  {facingMode === 'user' ? 'Front / Webcam' : 'Rear Camera'}
                </span>
              </div>
            )}
          </div>

          {/* Error Notices */}
          {(cameraError || wsError) && (
            <div className="p-3.5 bg-rose-500/10 border border-rose-500/30 rounded-xl text-rose-300 text-xs flex items-center space-x-2.5">
              <AlertCircle className="w-5 h-5 flex-shrink-0 text-rose-400" />
              <span>{cameraError || wsError}</span>
            </div>
          )}

          {/* Primary Action Buttons */}
          <div className="flex flex-wrap items-center gap-3">
            {!isStreaming ? (
              <button
                onClick={handleStart}
                className="flex-1 min-w-[160px] flex items-center justify-center space-x-2 bg-sky-600 hover:bg-sky-500 text-white font-medium py-3 px-5 rounded-xl shadow-lg shadow-sky-600/30 transition"
              >
                <Play className="w-5 h-5 fill-current" />
                <span>Start Live Stream</span>
              </button>
            ) : (
              <button
                onClick={handleStop}
                className="flex-1 min-w-[160px] flex items-center justify-center space-x-2 bg-rose-600 hover:bg-rose-500 text-white font-medium py-3 px-5 rounded-xl shadow-lg shadow-rose-600/30 transition"
              >
                <Square className="w-5 h-5 fill-current" />
                <span>Stop Stream</span>
              </button>
            )}

            <button
              onClick={toggleFacingMode}
              title="Switch Front/Rear Camera (Mobile)"
              className="flex items-center space-x-2 bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 py-3 px-4 rounded-xl transition"
            >
              <SwitchCamera className="w-5 h-5 text-sky-400" />
              <span className="hidden sm:inline">Flip Camera</span>
            </button>
          </div>
        </div>

        {/* Sidebar Controls & Parameters (1 Col on lg) */}
        <div className="bg-slate-900/80 border border-slate-800 rounded-2xl p-5 space-y-6">
          <div className="flex items-center space-x-2 pb-3 border-b border-slate-800">
            <Sliders className="w-5 h-5 text-sky-400" />
            <h3 className="font-semibold text-white text-sm">Stream Parameters</h3>
          </div>

          {/* Confidence Slider */}
          <div className="space-y-2">
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
          <div className="space-y-2">
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

          {/* Frame Skip Decimation Selector */}
          <div className="space-y-2">
            <div className="flex justify-between text-xs">
              <span className="text-slate-400 font-medium">Decimation Interval</span>
              <span className="text-emerald-400 font-mono font-semibold">
                {config.skip_interval === 1 ? 'Every Frame (1x)' : `Every ${config.skip_interval}th Frame`}
              </span>
            </div>
            <div className="grid grid-cols-4 gap-2">
              {[1, 2, 3, 4].map((n) => (
                <button
                  key={n}
                  onClick={() => handleConfigChange({ skip_interval: n })}
                  className={`py-1.5 text-xs font-mono font-semibold rounded-lg border transition ${
                    config.skip_interval === n
                      ? 'bg-sky-600 text-white border-sky-500'
                      : 'bg-slate-800 text-slate-300 border-slate-700 hover:bg-slate-700'
                  }`}
                >
                  {n === 1 ? '1x' : `${n}x`}
                </button>
              ))}
            </div>
            <p className="text-[11px] text-slate-500">
              Skipping frames reduces network latency while caching prevents bounding box flicker.
            </p>
          </div>

          {/* Target Capture Rate (FPS) */}
          <div className="space-y-2">
            <div className="flex justify-between text-xs">
              <span className="text-slate-400 font-medium">Capture Rate</span>
              <span className="text-sky-400 font-mono font-bold">{targetFps} FPS</span>
            </div>
            <div className="grid grid-cols-4 gap-2">
              {[6, 12, 18, 24].map((fps) => (
                <button
                  key={fps}
                  onClick={() => setTargetFps(fps)}
                  className={`py-1.5 text-xs font-mono font-semibold rounded-lg border transition ${
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

          {/* Class Filter */}
          <div className="space-y-2">
            <label className="text-xs text-slate-400 font-medium block">Class Filter</label>
            <div className="flex space-x-2">
              <input
                type="text"
                placeholder="e.g. person, dog, car"
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
              <div className="flex flex-wrap gap-1.5 mt-2">
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
                      className="hover:text-rose-400 ml-1"
                    >
                      &times;
                    </button>
                  </span>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

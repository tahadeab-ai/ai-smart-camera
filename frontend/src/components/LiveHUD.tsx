import React from 'react';
import {
  Activity,
  Crosshair,
  Maximize2,
  Minimize2,
  Clock,
  Layers,
  ArrowDownCircle,
} from 'lucide-react';

interface LiveHUDProps {
  isStreaming: boolean;
  frameId: number;
  fps: number;
  latencyMs: number;
  queueLatencyMs: number;
  droppedFrames: number;
  clientDropped: number;
  trackedCount: number;
  totalCount: number;
  classCounts: Record<string, number>;
  fitMode: 'contain' | 'cover';
  onToggleFitMode: () => void;
  facingMode: string;
  imageSize: number;
  aspectRatio: number;
  trackingEnabled: boolean;
}

export const LiveHUD: React.FC<LiveHUDProps> = ({
  isStreaming,
  frameId,
  fps,
  latencyMs,
  queueLatencyMs,
  droppedFrames,
  clientDropped,
  trackedCount,
  totalCount,
  classCounts,
  fitMode,
  onToggleFitMode,
  facingMode,
  imageSize,
  trackingEnabled,
}) => {
  const activeClassEntries = Object.entries(classCounts);

  return (
    <div className="absolute inset-0 pointer-events-none p-2 sm:p-3 flex flex-col justify-between z-20">
      {/* Top HUD Bar */}
      <div className="flex items-start justify-between gap-2 pointer-events-auto">
        {/* Left: Stream Status & Frame ID & Facing */}
        <div className="flex flex-wrap items-center gap-1.5 sm:gap-2">
          {/* Status Badge */}
          <div
            className={`flex items-center space-x-1.5 px-2.5 py-1 rounded-full text-[11px] font-mono font-semibold backdrop-blur-md shadow-lg border transition-all ${
              isStreaming
                ? 'bg-emerald-950/80 text-emerald-300 border-emerald-500/40 shadow-emerald-950/50'
                : 'bg-slate-950/80 text-slate-400 border-slate-700/80'
            }`}
          >
            <span
              className={`w-2 h-2 rounded-full ${
                isStreaming ? 'bg-emerald-400 animate-pulse' : 'bg-slate-500'
              }`}
            />
            <span>{isStreaming ? 'LIVE' : 'STANDBY'}</span>
          </div>

          {/* Frame Number */}
          {isStreaming && (
            <div className="px-2 py-0.5 rounded-full text-[10px] font-mono bg-slate-950/70 backdrop-blur-md border border-slate-700/70 text-slate-300">
              #{frameId}
            </div>
          )}

          {/* Camera Facing & Resolution Chip */}
          <div className="hidden xs:flex items-center space-x-1 px-2 py-0.5 rounded-full text-[10px] font-mono bg-slate-950/70 backdrop-blur-md border border-slate-700/70 text-sky-300 capitalize">
            <span>{facingMode === 'user' ? 'Front' : 'Rear'}</span>
            <span>&bull;</span>
            <span>{imageSize}px</span>
          </div>
        </div>

        {/* Right: Metrics & Fit Toggle */}
        <div className="flex items-center gap-1.5 sm:gap-2">
          {/* Real-time Telemetry Pill */}
          {isStreaming && (
            <div className="flex items-center space-x-1.5 px-2.5 py-1 rounded-full text-[11px] font-mono bg-slate-950/85 backdrop-blur-md border border-slate-700/80 text-white shadow-lg">
              {/* FPS */}
              <div className="flex items-center space-x-1">
                <Activity className="w-3 h-3 text-emerald-400" />
                <span className="font-bold text-emerald-400">{fps.toFixed(1)}</span>
                <span className="text-[9px] text-slate-400">fps</span>
              </div>

              <span className="text-slate-600">|</span>

              {/* Latency */}
              <div className="flex items-center space-x-1">
                <Clock className="w-3 h-3 text-sky-400" />
                <span className="font-bold text-sky-400">{Math.round(latencyMs)}</span>
                <span className="text-[9px] text-slate-400">ms</span>
              </div>

              {/* Queue lag if present */}
              {queueLatencyMs > 0 && (
                <>
                  <span className="hidden sm:inline text-slate-600">|</span>
                  <div className="hidden sm:flex items-center space-x-1 text-slate-300">
                    <span className="text-[9px] text-amber-400 font-bold">Q:</span>
                    <span>{Math.round(queueLatencyMs)}ms</span>
                  </div>
                </>
              )}
            </div>
          )}

          {/* Fit / Fill Aspect Toggle Button */}
          <button
            onClick={onToggleFitMode}
            title={fitMode === 'contain' ? 'Switch to Immersive Fill' : 'Switch to Fit Aspect'}
            className="p-1.5 rounded-full bg-slate-950/80 hover:bg-slate-800 text-slate-300 hover:text-white backdrop-blur-md border border-slate-700/80 shadow-lg transition active:scale-90"
            aria-label="Toggle Fit Mode"
          >
            {fitMode === 'contain' ? (
              <Maximize2 className="w-3.5 h-3.5 text-sky-400" />
            ) : (
              <Minimize2 className="w-3.5 h-3.5 text-sky-400" />
            )}
          </button>
        </div>
      </div>

      {/* Middle/Lower Detection Badges (Overlaid on feed) */}
      <div className="space-y-1.5">
        {/* Active Class Tags */}
        {isStreaming && activeClassEntries.length > 0 && (
          <div className="flex flex-wrap items-center gap-1 max-w-[85%] pointer-events-auto">
            {activeClassEntries.map(([cls, count]) => (
              <span
                key={cls}
                className="inline-flex items-center space-x-1 px-2 py-0.5 rounded-md text-[10px] font-mono bg-slate-950/80 backdrop-blur-md border border-emerald-500/40 text-emerald-300 shadow"
              >
                <span className="font-semibold">{cls}</span>
                <span className="bg-emerald-500/20 text-emerald-400 px-1 rounded-sm text-[9px] font-bold">
                  {count}
                </span>
              </span>
            ))}
          </div>
        )}

        {/* Object & Tracking Summary Chip */}
        {isStreaming && (
          <div className="flex items-center space-x-2 text-[10px] font-mono text-slate-400">
            {/* Total Detected */}
            <span className="inline-flex items-center space-x-1 px-2 py-0.5 rounded bg-slate-950/70 backdrop-blur-sm border border-slate-800 text-slate-300">
              <Layers className="w-2.5 h-2.5 text-sky-400" />
              <span>Detections: {totalCount}</span>
            </span>

            {/* Tracking Chip */}
            {trackingEnabled && (
              <span className="inline-flex items-center space-x-1 px-2 py-0.5 rounded bg-slate-950/70 backdrop-blur-sm border border-slate-800 text-indigo-300">
                <Crosshair className="w-2.5 h-2.5 text-indigo-400" />
                <span>Tracked: {trackedCount}</span>
              </span>
            )}

            {/* Dropped Frames if any */}
            {(droppedFrames > 0 || clientDropped > 0) && (
              <span className="hidden sm:inline-flex items-center space-x-1 px-2 py-0.5 rounded bg-slate-950/70 backdrop-blur-sm border border-slate-800 text-amber-400">
                <ArrowDownCircle className="w-2.5 h-2.5" />
                <span>Dropped: S:{droppedFrames} C:{clientDropped}</span>
              </span>
            )}
          </div>
        )}
      </div>
    </div>
  );
};

import React from 'react';
import { Activity, Clock, Layers, Zap, Crosshair } from 'lucide-react';

interface MetricsBarProps {
  fps: number;
  latencyMs: number;
  totalCount: number;
  classCounts: Record<string, number>;
  trackedCount?: number;
  trackedClassCounts?: Record<string, number>;
  skipped?: boolean;
  isStreaming?: boolean;
  droppedFrames?: number;
  queueReplacements?: number;
  clientDropped?: number;
  queueLatencyMs?: number;
}

export const MetricsBar: React.FC<MetricsBarProps> = ({
  fps,
  latencyMs,
  totalCount,
  classCounts,
  trackedCount,
  trackedClassCounts,
  skipped = false,
  isStreaming = false,
  droppedFrames = 0,
  queueReplacements = 0,
  clientDropped = 0,
  queueLatencyMs = 0,
}) => {
  // If streaming is inactive, show standby values
  const displayFps = isStreaming ? fps.toFixed(1) : '0.0';
  const displayLatency = isStreaming ? latencyMs.toFixed(1) : '0.0';
  const displayCount = isStreaming ? totalCount : 0;
  const displayTracked = isStreaming && trackedCount !== undefined ? trackedCount : null;

  return (
    <div className="space-y-2">
      {/* Primary KPI Grid (Responsive 2 cols on mobile, 4 on tablet/desktop) */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 sm:gap-2.5">
        {/* FPS Card */}
        <div className="bg-slate-900/90 border border-slate-800 p-2.5 rounded-xl flex items-center space-x-2.5">
          <div className="p-2 bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 rounded-lg">
            <Zap className="w-4 h-4 sm:w-5 sm:h-5" />
          </div>
          <div>
            <div className="text-[10px] sm:text-xs text-slate-400 font-medium">Throughput</div>
            <div className="text-base sm:text-lg font-bold text-white font-mono leading-tight">
              {displayFps} <span className="text-[10px] sm:text-xs text-slate-500 font-normal">FPS</span>
            </div>
          </div>
        </div>

        {/* Latency Card */}
        <div className="bg-slate-900/90 border border-slate-800 p-2.5 rounded-xl flex items-center space-x-2.5">
          <div className="p-2 bg-sky-500/10 border border-sky-500/20 text-sky-400 rounded-lg">
            <Clock className="w-4 h-4 sm:w-5 sm:h-5" />
          </div>
          <div>
            <div className="text-[10px] sm:text-xs text-slate-400 font-medium">Pipeline Latency</div>
            <div className="text-base sm:text-lg font-bold text-white font-mono leading-tight">
              {displayLatency} <span className="text-[10px] sm:text-xs text-slate-500 font-normal">ms</span>
            </div>
          </div>
        </div>

        {/* Detected & Tracked Objects Card */}
        <div className="bg-slate-900/90 border border-slate-800 p-2.5 rounded-xl flex items-center space-x-2.5">
          <div className="p-2 bg-indigo-500/10 border border-indigo-500/20 text-indigo-400 rounded-lg">
            {displayTracked !== null ? (
              <Crosshair className="w-4 h-4 sm:w-5 sm:h-5" />
            ) : (
              <Layers className="w-4 h-4 sm:w-5 sm:h-5" />
            )}
          </div>
          <div>
            <div className="text-[10px] sm:text-xs text-slate-400 font-medium">
              {displayTracked !== null ? 'Detected / Tracked' : 'Objects Detected'}
            </div>
            <div className="text-base sm:text-lg font-bold text-white font-mono leading-tight">
              {displayCount}
              {displayTracked !== null && (
                <span className="text-xs sm:text-sm text-sky-400 font-semibold ml-1.5">
                  ({displayTracked} tracked)
                </span>
              )}
            </div>
          </div>
        </div>

        {/* Pipeline State Card */}
        <div className="bg-slate-900/90 border border-slate-800 p-2.5 rounded-xl flex items-center space-x-2.5">
          <div
            className={`p-2 rounded-lg border ${
              !isStreaming
                ? 'bg-slate-800/80 border-slate-700 text-slate-500'
                : skipped
                ? 'bg-amber-500/10 border-amber-500/20 text-amber-400'
                : 'bg-teal-500/10 border-teal-500/20 text-teal-400'
            }`}
          >
            <Activity className="w-4 h-4 sm:w-5 sm:h-5" />
          </div>
          <div>
            <div className="text-[10px] sm:text-xs text-slate-400 font-medium">Pipeline State</div>
            <div className="text-xs sm:text-sm font-semibold truncate leading-tight">
              {!isStreaming ? (
                <span className="text-slate-500 font-mono">Idle / Standby</span>
              ) : skipped ? (
                <span className="text-amber-400">Decimated (Cached)</span>
              ) : (
                <span className="text-teal-400">Active Inference</span>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Real-Time Backpressure & Drops HUD (Visible when streaming) */}
      {isStreaming && (
        <div className="bg-slate-900/60 border border-slate-800/80 px-3 py-1.5 rounded-lg flex flex-wrap items-center justify-between text-[11px] font-mono text-slate-400 gap-2">
          <div className="flex items-center space-x-3">
            <span className="flex items-center space-x-1">
              <span className="text-slate-500">Queue Lag:</span>
              <span className="text-slate-200">{queueLatencyMs.toFixed(1)}ms</span>
            </span>
            <span className="text-slate-700">&bull;</span>
            <span className="flex items-center space-x-1">
              <span className="text-slate-500">Client Drops:</span>
              <span className={clientDropped > 0 ? 'text-amber-400 font-semibold' : 'text-slate-300'}>
                {clientDropped}
              </span>
            </span>
            <span className="text-slate-700">&bull;</span>
            <span className="flex items-center space-x-1">
              <span className="text-slate-500">Server Drops:</span>
              <span className={droppedFrames > 0 ? 'text-amber-400 font-semibold' : 'text-slate-300'}>
                {droppedFrames}
              </span>
            </span>
          </div>

          <div className="text-[10px] text-slate-500">
            {queueReplacements > 0 ? `${queueReplacements} latest-frame replacements` : 'zero queue backlog'}
          </div>
        </div>
      )}

      {/* Class Breakdown Tags */}
      {isStreaming && Object.keys(classCounts).length > 0 && (
        <div className="bg-slate-900/60 border border-slate-800/80 px-3 py-1.5 rounded-xl flex flex-wrap items-center gap-1.5 text-xs">
          <span className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider mr-1">
            Classes:
          </span>
          {Object.entries(classCounts).map(([cls, cnt]) => {
            const trackedCnt = trackedClassCounts?.[cls];
            return (
              <span
                key={cls}
                className="inline-flex items-center space-x-1.5 px-2 py-0.5 rounded-md text-xs font-medium bg-slate-800 text-sky-300 border border-slate-700 font-mono"
              >
                <span>{cls}</span>
                <span className="bg-sky-500/20 text-sky-400 px-1 py-0.2 rounded-full font-bold text-[10px]">
                  {cnt}
                </span>
                {trackedCnt !== undefined && (
                  <span className="text-[10px] text-emerald-400 font-semibold" title="Active Tracks">
                    [#{trackedCnt}]
                  </span>
                )}
              </span>
            );
          })}
        </div>
      )}
    </div>
  );
};

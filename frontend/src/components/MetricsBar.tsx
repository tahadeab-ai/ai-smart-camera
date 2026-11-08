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
}) => {
  // If streaming is inactive, show standby values
  const displayFps = isStreaming ? fps.toFixed(1) : '0.0';
  const displayLatency = isStreaming ? latencyMs.toFixed(1) : '0.0';
  const displayCount = isStreaming ? totalCount : 0;
  const displayTracked = isStreaming && trackedCount !== undefined ? trackedCount : null;

  return (
    <div className="space-y-2.5">
      {/* Primary KPI Grid (Responsive 2 cols on mobile, 4 on tablet/desktop) */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 sm:gap-3">
        {/* FPS Card */}
        <div className="bg-slate-900/90 border border-slate-800 p-2.5 sm:p-3 rounded-xl flex items-center space-x-2.5 sm:space-x-3">
          <div className="p-2 sm:p-2.5 bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 rounded-lg">
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
        <div className="bg-slate-900/90 border border-slate-800 p-2.5 sm:p-3 rounded-xl flex items-center space-x-2.5 sm:space-x-3">
          <div className="p-2 sm:p-2.5 bg-sky-500/10 border border-sky-500/20 text-sky-400 rounded-lg">
            <Clock className="w-4 h-4 sm:w-5 sm:h-5" />
          </div>
          <div>
            <div className="text-[10px] sm:text-xs text-slate-400 font-medium">Latency</div>
            <div className="text-base sm:text-lg font-bold text-white font-mono leading-tight">
              {displayLatency} <span className="text-[10px] sm:text-xs text-slate-500 font-normal">ms</span>
            </div>
          </div>
        </div>

        {/* Detected & Tracked Objects Card */}
        <div className="bg-slate-900/90 border border-slate-800 p-2.5 sm:p-3 rounded-xl flex items-center space-x-2.5 sm:space-x-3">
          <div className="p-2 sm:p-2.5 bg-indigo-500/10 border border-indigo-500/20 text-indigo-400 rounded-lg">
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
        <div className="bg-slate-900/90 border border-slate-800 p-2.5 sm:p-3 rounded-xl flex items-center space-x-2.5 sm:space-x-3">
          <div
            className={`p-2 sm:p-2.5 rounded-lg border ${
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

      {/* Class Breakdown Tags */}
      {isStreaming && Object.keys(classCounts).length > 0 && (
        <div className="bg-slate-900/60 border border-slate-800/80 px-3 py-2 rounded-xl flex flex-wrap items-center gap-1.5 text-xs">
          <span className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider mr-1">
            Detections:
          </span>
          {Object.entries(classCounts).map(([cls, cnt]) => {
            const trackedCnt = trackedClassCounts?.[cls];
            return (
              <span
                key={cls}
                className="inline-flex items-center space-x-1.5 px-2 py-0.5 rounded-md text-xs font-medium bg-slate-800 text-sky-300 border border-slate-700 font-mono"
              >
                <span>{cls}</span>
                <span className="bg-sky-500/20 text-sky-400 px-1 py-0.2 rounded-full font-bold text-[11px]">
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

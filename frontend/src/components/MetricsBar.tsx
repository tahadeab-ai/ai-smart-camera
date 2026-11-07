import React from 'react';
import { Activity, Clock, Layers, Zap } from 'lucide-react';

interface MetricsBarProps {
  fps: number;
  latencyMs: number;
  totalCount: number;
  classCounts: Record<string, number>;
  skipped?: boolean;
}

export const MetricsBar: React.FC<MetricsBarProps> = ({
  fps,
  latencyMs,
  totalCount,
  classCounts,
  skipped = false,
}) => {
  return (
    <div className="space-y-3">
      {/* Primary KPI Grid */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <div className="bg-slate-900/90 border border-slate-800 p-3.5 rounded-xl flex items-center space-x-3">
          <div className="p-2.5 bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 rounded-lg">
            <Zap className="w-5 h-5" />
          </div>
          <div>
            <div className="text-xs text-slate-400 font-medium">Throughput</div>
            <div className="text-lg font-bold text-white font-mono">{fps.toFixed(1)} <span className="text-xs text-slate-500 font-normal">FPS</span></div>
          </div>
        </div>

        <div className="bg-slate-900/90 border border-slate-800 p-3.5 rounded-xl flex items-center space-x-3">
          <div className="p-2.5 bg-sky-500/10 border border-sky-500/20 text-sky-400 rounded-lg">
            <Clock className="w-5 h-5" />
          </div>
          <div>
            <div className="text-xs text-slate-400 font-medium">Inference Latency</div>
            <div className="text-lg font-bold text-white font-mono">
              {latencyMs.toFixed(1)} <span className="text-xs text-slate-500 font-normal">ms</span>
            </div>
          </div>
        </div>

        <div className="bg-slate-900/90 border border-slate-800 p-3.5 rounded-xl flex items-center space-x-3">
          <div className="p-2.5 bg-indigo-500/10 border border-indigo-500/20 text-indigo-400 rounded-lg">
            <Layers className="w-5 h-5" />
          </div>
          <div>
            <div className="text-xs text-slate-400 font-medium">Objects Detected</div>
            <div className="text-lg font-bold text-white font-mono">{totalCount}</div>
          </div>
        </div>

        <div className="bg-slate-900/90 border border-slate-800 p-3.5 rounded-xl flex items-center space-x-3">
          <div className={`p-2.5 rounded-lg border ${
            skipped
              ? 'bg-amber-500/10 border-amber-500/20 text-amber-400'
              : 'bg-teal-500/10 border-teal-500/20 text-teal-400'
          }`}>
            <Activity className="w-5 h-5" />
          </div>
          <div>
            <div className="text-xs text-slate-400 font-medium">Pipeline State</div>
            <div className="text-sm font-semibold text-white">
              {skipped ? (
                <span className="text-amber-400">Decimated (Cached)</span>
              ) : (
                <span className="text-teal-400">Active Inference</span>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Class Tag Breakdown */}
      {Object.keys(classCounts).length > 0 && (
        <div className="bg-slate-900/60 border border-slate-800/80 px-4 py-2.5 rounded-xl flex flex-wrap items-center gap-2">
          <span className="text-xs font-medium text-slate-400 uppercase tracking-wider">Breakdown:</span>
          {Object.entries(classCounts).map(([cls, cnt]) => (
            <span
              key={cls}
              className="inline-flex items-center space-x-1.5 px-2.5 py-1 rounded-md text-xs font-medium bg-slate-800 text-sky-300 border border-slate-700 font-mono"
            >
              <span>{cls}</span>
              <span className="bg-sky-500/20 text-sky-400 px-1.5 py-0.2 rounded-full font-bold">
                {cnt}
              </span>
            </span>
          ))}
        </div>
      )}
    </div>
  );
};

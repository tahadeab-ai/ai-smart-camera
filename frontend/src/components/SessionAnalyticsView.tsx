import React from 'react';
import { Activity, Layers, Crosshair, ArrowDownCircle, RefreshCw } from 'lucide-react';
import { SessionAnalyticsData } from '../types';

interface SessionAnalyticsViewProps {
  analyticsData: SessionAnalyticsData;
  onResetSession: () => void;
  isStreaming?: boolean;
}

export const SessionAnalyticsView: React.FC<SessionAnalyticsViewProps> = ({
  analyticsData,
  onResetSession,
  isStreaming = false,
}) => {
  const {
    totalFrames,
    processedFrames,
    droppedFrames,
    avgLatencyMs,
    avgFps,
    classDistribution,
    trackedCount,
    maxConcurrentTracked,
    startTime,
  } = analyticsData;

  const sessionDurationSec = startTime > 0 ? Math.round((Date.now() - startTime) / 1000) : 0;
  const sessionMinutes = Math.floor(sessionDurationSec / 60);
  const sessionSeconds = sessionDurationSec % 60;

  const sortedClasses = Object.entries(classDistribution).sort((a, b) => b[1] - a[1]);
  const totalDetectionsCount = Object.values(classDistribution).reduce((sum, v) => sum + v, 0);

  return (
    <div className="flex-1 flex flex-col p-3 sm:p-6 max-w-5xl mx-auto w-full space-y-6">
      {/* Header with Title and Reset */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 bg-slate-900 border border-slate-800 rounded-2xl p-4 sm:p-5">
        <div>
          <div className="flex items-center space-x-2">
            <h2 className="text-xl font-bold text-white">Live Session Analytics</h2>
            {isStreaming && (
              <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[11px] font-semibold bg-emerald-500/15 text-emerald-400 border border-emerald-500/30">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                Active Stream
              </span>
            )}
          </div>
          <p className="text-xs text-slate-400 mt-1">
            Aggregated metrics derived exclusively from live stream frames processed during the current active session.
          </p>
        </div>

        <button
          onClick={onResetSession}
          className="flex items-center space-x-1.5 px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-xl text-xs font-medium border border-slate-700 transition"
        >
          <RefreshCw className="w-3.5 h-3.5" />
          <span>Reset Session Data</span>
        </button>
      </div>

      {/* KPI Cards Grid */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4">
          <div className="flex items-center justify-between text-slate-400 mb-2">
            <span className="text-xs font-medium">Session Duration</span>
            <Activity className="w-4 h-4 text-sky-400" />
          </div>
          <div className="text-2xl font-bold text-white font-mono">
            {sessionMinutes}m {sessionSeconds < 10 ? `0${sessionSeconds}` : sessionSeconds}s
          </div>
          <div className="text-[11px] text-slate-500 mt-1">
            Total frames sent: <span className="text-slate-300 font-mono">{totalFrames}</span>
          </div>
        </div>

        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4">
          <div className="flex items-center justify-between text-slate-400 mb-2">
            <span className="text-xs font-medium">Processed Throughput</span>
            <Layers className="w-4 h-4 text-emerald-400" />
          </div>
          <div className="text-2xl font-bold text-emerald-400 font-mono">
            {processedFrames}
          </div>
          <div className="text-[11px] text-slate-500 mt-1">
            Avg rolling rate: <span className="text-slate-300 font-mono">{avgFps.toFixed(1)} FPS</span>
          </div>
        </div>

        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4">
          <div className="flex items-center justify-between text-slate-400 mb-2">
            <span className="text-xs font-medium">Server Latency</span>
            <Activity className="w-4 h-4 text-amber-400" />
          </div>
          <div className="text-2xl font-bold text-white font-mono">
            {avgLatencyMs.toFixed(0)} <span className="text-xs text-slate-400">ms</span>
          </div>
          <div className="text-[11px] text-slate-500 mt-1">
            Server drops: <span className="text-rose-400 font-mono">{droppedFrames}</span>
          </div>
        </div>

        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4">
          <div className="flex items-center justify-between text-slate-400 mb-2">
            <span className="text-xs font-medium">Tracked Objects</span>
            <Crosshair className="w-4 h-4 text-purple-400" />
          </div>
          <div className="text-2xl font-bold text-purple-400 font-mono">
            {trackedCount}
          </div>
          <div className="text-[11px] text-slate-500 mt-1">
            Peak concurrency: <span className="text-slate-300 font-mono">{maxConcurrentTracked}</span>
          </div>
        </div>
      </div>

      {/* Class Distribution Breakdown */}
      <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 sm:p-6">
        <div className="flex items-center justify-between mb-4">
          <h3 className="font-semibold text-white text-base">Detected Class Distribution</h3>
          <span className="text-xs text-slate-400 font-mono">
            {totalDetectionsCount} total object instances
          </span>
        </div>

        {sortedClasses.length === 0 ? (
          <div className="text-center py-8 text-slate-500 text-xs">
            No detections recorded in the current session. Start streaming or analyze an image to view category distribution.
          </div>
        ) : (
          <div className="space-y-3">
            {sortedClasses.map(([className, count]) => {
              const percentage = totalDetectionsCount > 0 ? (count / totalDetectionsCount) * 100 : 0;
              return (
                <div key={className} className="space-y-1">
                  <div className="flex items-center justify-between text-xs font-medium">
                    <span className="text-slate-200 capitalize">{className}</span>
                    <span className="text-slate-400 font-mono">
                      {count} ({percentage.toFixed(1)}%)
                    </span>
                  </div>
                  <div className="w-full h-2 rounded-full bg-slate-800 overflow-hidden">
                    <div
                      className="h-full rounded-full bg-gradient-to-r from-emerald-500 to-sky-500 transition-all duration-300"
                      style={{ width: `${percentage}%` }}
                    />
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Observability Note */}
      <div className="bg-slate-950 border border-slate-800/80 rounded-2xl p-4 text-xs text-slate-500 leading-relaxed flex items-start space-x-2">
        <ArrowDownCircle className="w-4 h-4 text-sky-400 flex-shrink-0 mt-0.5" />
        <div>
          <strong className="text-slate-400">Strict Data Integrity Notice:</strong> Session telemetry is held strictly in ephemeral browser state for the duration of the current camera stream and is never fabricated or persisted to an external database.
        </div>
      </div>
    </div>
  );
};

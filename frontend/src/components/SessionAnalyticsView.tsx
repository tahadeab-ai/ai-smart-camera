import React, { useEffect, useState } from 'react';
import {
  Activity,
  Layers,
  Crosshair,
  RefreshCw,
  Clock,
  Send,
  Eye,
  AlertTriangle,
  Info,
} from 'lucide-react';
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
    totalSent,
    totalFrames,
    processedFrames,
    displayedFrames,
    serverDroppedFrames,
    clientDroppedFrames,
    avgLatencyMs,
    avgServerFps,
    avgFps,
    classDistribution,
    trackedCount,
    maxConcurrentTracked,
    startTime,
  } = analyticsData;

  // Real-time timer ticker so session duration increments every second
  const [currentTime, setCurrentTime] = useState<number>(Date.now());

  useEffect(() => {
    const timer = window.setInterval(() => {
      setCurrentTime(Date.now());
    }, 1000);
    return () => clearInterval(timer);
  }, []);

  const sessionDurationSec =
    startTime > 0 ? Math.max(0, Math.round((currentTime - startTime) / 1000)) : 0;
  const sessionMinutes = Math.floor(sessionDurationSec / 60);
  const sessionSeconds = sessionDurationSec % 60;

  const actualSent = totalSent || totalFrames || 0;
  const actualServerDrops = serverDroppedFrames ?? 0;
  const actualClientDrops = clientDroppedFrames ?? 0;

  const sortedClasses = Object.entries(classDistribution).sort((a, b) => b[1] - a[1]);
  const totalDetectionsCount = Object.values(classDistribution).reduce((sum, v) => sum + v, 0);

  return (
    <div className="flex-1 flex flex-col p-3 sm:p-6 max-w-5xl mx-auto w-full space-y-6">
      {/* Header with Title and Reset */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 bg-slate-900 border border-slate-800 rounded-2xl p-4 sm:p-5">
        <div>
          <div className="flex items-center space-x-2">
            <h2 className="text-xl font-bold text-white">Live Session Analytics</h2>
            {isStreaming ? (
              <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[11px] font-semibold bg-emerald-500/15 text-emerald-400 border border-emerald-500/30">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                Active Stream
              </span>
            ) : (
              <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[11px] font-semibold bg-slate-800 text-slate-400 border border-slate-700">
                Standby
              </span>
            )}
          </div>
          <p className="text-xs text-slate-400 mt-1">
            Telemetry collected exclusively from live stream frames processed during the current session.
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

      {/* SECTION 1: Cumulative Session Totals */}
      <div className="space-y-3">
        <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-400 flex items-center space-x-1.5">
          <Clock className="w-3.5 h-3.5 text-sky-400" />
          <span>Cumulative Session Totals</span>
        </h3>

        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
          {/* Active Duration */}
          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4">
            <div className="flex items-center justify-between text-slate-400 mb-2">
              <span className="text-xs font-medium">Session Duration</span>
              <Clock className="w-4 h-4 text-sky-400" />
            </div>
            <div className="text-2xl font-bold text-white font-mono">
              {sessionMinutes}m {sessionSeconds < 10 ? `0${sessionSeconds}` : sessionSeconds}s
            </div>
            <div className="text-[11px] text-slate-500 mt-1">
              Started: {startTime > 0 ? new Date(startTime).toLocaleTimeString() : 'Not started'}
            </div>
          </div>

          {/* Client Sent Frames */}
          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4">
            <div className="flex items-center justify-between text-slate-400 mb-2">
              <span className="text-xs font-medium">Frames Sent (Client)</span>
              <Send className="w-4 h-4 text-emerald-400" />
            </div>
            <div className="text-2xl font-bold text-white font-mono">
              {actualSent}
            </div>
            <div className="text-[11px] text-slate-500 mt-1">
              Successful websocket dispatches
            </div>
          </div>

          {/* Processed & Displayed */}
          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4">
            <div className="flex items-center justify-between text-slate-400 mb-2">
              <span className="text-xs font-medium">Processed / Displayed</span>
              <Eye className="w-4 h-4 text-teal-400" />
            </div>
            <div className="text-2xl font-bold text-teal-400 font-mono">
              {processedFrames} <span className="text-xs text-slate-400 font-normal">/ {displayedFrames}</span>
            </div>
            <div className="text-[11px] text-slate-500 mt-1">
              Frames evaluated & rendered
            </div>
          </div>

          {/* Drops: Server vs Client */}
          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4">
            <div className="flex items-center justify-between text-slate-400 mb-2">
              <span className="text-xs font-medium">Dropped Frames</span>
              <AlertTriangle className="w-4 h-4 text-amber-400" />
            </div>
            <div className="text-2xl font-bold text-white font-mono">
              {actualServerDrops + actualClientDrops}
            </div>
            <div className="text-[11px] text-slate-500 mt-1 flex items-center justify-between">
              <span>Server: <strong className="text-rose-400">{actualServerDrops}</strong></span>
              <span>Client: <strong className="text-amber-400">{actualClientDrops}</strong></span>
            </div>
          </div>
        </div>
      </div>

      {/* SECTION 2: Instantaneous Pipeline Performance */}
      <div className="space-y-3">
        <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-400 flex items-center space-x-1.5">
          <Activity className="w-3.5 h-3.5 text-emerald-400" />
          <span>Pipeline Performance & Multi-Object Tracking</span>
        </h3>

        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-3 sm:gap-4">
          {/* Average Server FPS */}
          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4">
            <div className="flex items-center justify-between text-slate-400 mb-2">
              <span className="text-xs font-medium">Server Inference</span>
              <Activity className="w-4 h-4 text-emerald-400" />
            </div>
            <div className="text-2xl font-bold text-emerald-400 font-mono">
              {avgServerFps.toFixed(1)} <span className="text-xs text-slate-400 font-normal">FPS</span>
            </div>
            <div className="text-[11px] text-slate-500 mt-1">
              YOLO & ByteTrack execution
            </div>
          </div>

          {/* Display Render Rate */}
          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4">
            <div className="flex items-center justify-between text-slate-400 mb-2">
              <span className="text-xs font-medium">Display Render</span>
              <Eye className="w-4 h-4 text-teal-400" />
            </div>
            <div className="text-2xl font-bold text-teal-400 font-mono">
              {avgFps.toFixed(1)} <span className="text-xs text-slate-400 font-normal">FPS</span>
            </div>
            <div className="text-[11px] text-slate-500 mt-1">
              Browser image load / decode rate (rolling 5s)
            </div>
          </div>

          {/* Average Latency */}
          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4">
            <div className="flex items-center justify-between text-slate-400 mb-2">
              <span className="text-xs font-medium">Server Latency</span>
              <Layers className="w-4 h-4 text-amber-400" />
            </div>
            <div className="text-2xl font-bold text-white font-mono">
              {avgLatencyMs.toFixed(0)} <span className="text-xs text-slate-400 font-normal">ms</span>
            </div>
            <div className="text-[11px] text-slate-500 mt-1">
              Average per-frame inference duration
            </div>
          </div>

          {/* Current Tracked Objects */}
          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4">
            <div className="flex items-center justify-between text-slate-400 mb-2">
              <span className="text-xs font-medium">Active Tracked Targets</span>
              <Crosshair className="w-4 h-4 text-purple-400" />
            </div>
            <div className="text-2xl font-bold text-purple-400 font-mono">
              {trackedCount}
            </div>
            <div className="text-[11px] text-slate-500 mt-1">
              ByteTrack assigned unique IDs
            </div>
          </div>

          {/* Peak Concurrency */}
          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4">
            <div className="flex items-center justify-between text-slate-400 mb-2">
              <span className="text-xs font-medium">Peak Concurrency</span>
              <Layers className="w-4 h-4 text-indigo-400" />
            </div>
            <div className="text-2xl font-bold text-indigo-300 font-mono">
              {maxConcurrentTracked}
            </div>
            <div className="text-[11px] text-slate-500 mt-1">
              Max simultaneous tracks seen
            </div>
          </div>
        </div>
      </div>

      {/* SECTION 3: Class Distribution Breakdown */}
      <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 sm:p-6 space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-1 pb-3 border-b border-slate-800">
          <div>
            <h3 className="font-semibold text-white text-base">Category Detection Occurrences (Cumulative)</h3>
            <p className="text-xs text-slate-400 mt-0.5">
              Total bounding boxes detected across all analyzed stream frames (occurrence instances, not unique individuals).
            </p>
          </div>
          <span className="text-xs text-slate-400 font-mono self-start sm:self-auto">
            {totalDetectionsCount} total detections
          </span>
        </div>

        {sortedClasses.length === 0 ? (
          <div className="text-center py-8 text-slate-500 text-xs">
            No detections recorded in the current session. Start streaming to view category distribution.
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
                      {count} occurrences ({percentage.toFixed(1)}%)
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
        <Info className="w-4 h-4 text-sky-400 flex-shrink-0 mt-0.5" />
        <div>
          <strong className="text-slate-400">Strict Data Integrity Notice:</strong> Session telemetry is held strictly in ephemeral browser memory for the duration of the current session. Client drops represent frames skipped due to socket backpressure or single-flight capture, while server drops represent frames discarded by the server queue when inference was in flight.
        </div>
      </div>
    </div>
  );
};

import React from 'react';
import { Film, Clock, Sparkles, CheckCircle2, ArrowRight } from 'lucide-react';

export const VideoAnalysisView: React.FC = () => {
  return (
    <div className="flex-1 flex flex-col items-center justify-center p-4 sm:p-8 max-w-4xl mx-auto w-full">
      <div className="bg-slate-900 border border-slate-800 rounded-3xl p-6 sm:p-10 shadow-2xl text-center relative overflow-hidden w-full">
        {/* Subtle background glow */}
        <div className="absolute top-0 left-1/2 -translate-x-1/2 w-96 h-96 bg-sky-500/10 rounded-full blur-3xl pointer-events-none" />

        <div className="relative z-10 flex flex-col items-center">
          <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-sky-500/10 border border-sky-500/20 text-sky-400 text-xs font-semibold mb-6">
            <Sparkles className="w-3.5 h-3.5" />
            <span>ROADMAP MILESTONE v0.4.0</span>
          </div>

          <div className="w-20 h-20 rounded-2xl bg-gradient-to-tr from-slate-800 to-slate-700 border border-slate-700/60 flex items-center justify-center mb-6 shadow-inner">
            <Film className="w-10 h-10 text-sky-400" />
          </div>

          <h2 className="text-2xl sm:text-3xl font-bold text-white mb-3">
            Asynchronous Video Analysis Pipeline
          </h2>

          <p className="text-slate-400 text-sm sm:text-base max-w-xl mx-auto mb-8 leading-relaxed">
            AI Smart Camera is focused on ultra-low-latency live camera streaming in v0.3.0. 
            Batch video file processing with multi-camera ingest, long-range trajectory analytics, and exportable annotated video MP4 files is scheduled for the upcoming <strong className="text-slate-200">v0.4.0</strong> release.
          </p>

          {/* Planned Features Grid */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 text-left w-full mb-8">
            <div className="bg-slate-950/60 border border-slate-800 rounded-2xl p-4">
              <div className="flex items-center space-x-2 text-emerald-400 mb-2 font-semibold text-sm">
                <CheckCircle2 className="w-4 h-4" />
                <span>Format Ingestion</span>
              </div>
              <p className="text-xs text-slate-400 leading-normal">
                Direct upload of MP4, MKV, AVI, and WebM video files up to 2GB with automatic transcoding.
              </p>
            </div>

            <div className="bg-slate-950/60 border border-slate-800 rounded-2xl p-4">
              <div className="flex items-center space-x-2 text-sky-400 mb-2 font-semibold text-sm">
                <CheckCircle2 className="w-4 h-4" />
                <span>Async Task Queue</span>
              </div>
              <p className="text-xs text-slate-400 leading-normal">
                Celery / Redis background worker processing with real-time frame progress bar and ETA.
              </p>
            </div>

            <div className="bg-slate-950/60 border border-slate-800 rounded-2xl p-4">
              <div className="flex items-center space-x-2 text-purple-400 mb-2 font-semibold text-sm">
                <CheckCircle2 className="w-4 h-4" />
                <span>Trajectory Export</span>
              </div>
              <p className="text-xs text-slate-400 leading-normal">
                Complete ByteTrack tracking logs exported to CSV, JSON, and rendered MP4 with full motion trails.
              </p>
            </div>
          </div>

          {/* Development Status banner */}
          <div className="flex flex-col sm:flex-row items-center justify-between gap-4 w-full bg-slate-950/80 border border-slate-800/80 rounded-2xl px-5 py-4 text-xs text-slate-400">
            <div className="flex items-center space-x-2">
              <Clock className="w-4 h-4 text-amber-400" />
              <span>Status: Architectural Design & Requirements Phase</span>
            </div>

            <a
              href="https://github.com/tahadeab-ai/ai-smart-camera/issues"
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center space-x-1.5 text-sky-400 hover:text-sky-300 font-semibold"
            >
              <span>Track v0.4.0 RFC on GitHub</span>
              <ArrowRight className="w-3.5 h-3.5" />
            </a>
          </div>
        </div>
      </div>
    </div>
  );
};

import React from 'react';
import { ShieldCheck, Key, ExternalLink, Github, Activity } from 'lucide-react';
import { AppViewTab } from '../../types';

interface TopHeaderProps {
  activeTab: AppViewTab;
  isBackendReady: boolean;
  activeModel: string;
  hasToken: boolean;
  onOpenTokenModal: () => void;
}

export const TopHeader: React.FC<TopHeaderProps> = ({
  activeTab,
  isBackendReady,
  activeModel,
  hasToken,
  onOpenTokenModal,
}) => {
  const getTabTitle = (tab: AppViewTab): string => {
    switch (tab) {
      case 'camera':
        return 'Live Camera Stream';
      case 'image':
        return 'Image Detection Studio';
      case 'video':
        return 'Video Analysis (v0.4.0)';
      case 'analytics':
        return 'Session Analytics';
      case 'system':
        return 'Models & System Runtime';
    }
  };

  return (
    <header className="h-14 bg-slate-900/90 backdrop-blur-md border-b border-slate-800 flex items-center justify-between px-3 sm:px-6 z-20 flex-shrink-0">
      {/* Mobile Brand / Desktop View Title */}
      <div className="flex items-center space-x-2 sm:space-x-3">
        <div className="md:hidden flex items-center space-x-2">
          <div className="w-7 h-7 rounded-lg bg-gradient-to-tr from-emerald-600 to-sky-500 flex items-center justify-center">
            <Activity className="w-4 h-4 text-white" />
          </div>
          <span className="font-bold text-xs tracking-wider text-white">VISION CONTROL</span>
        </div>

        <div className="hidden md:flex items-center space-x-2 text-sm">
          <span className="font-semibold text-white">{getTabTitle(activeTab)}</span>
          <span className="text-slate-600">&bull;</span>
          <span className="text-xs text-slate-400 font-mono bg-slate-800 px-2 py-0.5 rounded-md border border-slate-700/50">
            {activeModel}
          </span>
        </div>
      </div>

      {/* Right Actions */}
      <div className="flex items-center space-x-2 sm:space-x-3 text-xs">
        {/* Backend Status indicator */}
        <div
          className={`flex items-center space-x-1.5 px-2.5 py-1 rounded-full border text-[11px] font-medium ${
            isBackendReady
              ? 'bg-emerald-500/10 border-emerald-500/20 text-emerald-400'
              : 'bg-rose-500/10 border-rose-500/20 text-rose-400'
          }`}
        >
          <span
            className={`w-1.5 h-1.5 rounded-full ${
              isBackendReady ? 'bg-emerald-400' : 'bg-rose-400 animate-ping'
            }`}
          />
          <span className="hidden sm:inline">{isBackendReady ? 'API Live' : 'API Offline'}</span>
        </div>

        {/* Token Button */}
        <button
          onClick={onOpenTokenModal}
          className={`flex items-center space-x-1 px-2.5 py-1 rounded-lg transition text-[11px] font-medium ${
            hasToken
              ? 'bg-slate-800 text-slate-300 hover:bg-slate-700 border border-slate-700'
              : 'bg-amber-500/10 text-amber-300 border border-amber-500/30'
          }`}
        >
          {hasToken ? <ShieldCheck className="w-3.5 h-3.5 text-emerald-400" /> : <Key className="w-3.5 h-3.5 text-amber-400" />}
          <span className="hidden sm:inline">{hasToken ? 'Token Configured' : 'Set Token'}</span>
        </button>

        {/* External Links on Desktop */}
        <div className="hidden lg:flex items-center space-x-3 pl-2 border-l border-slate-800 text-slate-400">
          <a
            href="/docs"
            target="_blank"
            rel="noreferrer"
            className="hover:text-sky-400 flex items-center space-x-1 transition"
            title="Swagger API Docs"
          >
            <ExternalLink className="w-3.5 h-3.5" />
          </a>
          <a
            href="https://github.com/tahadeab-ai/ai-smart-camera"
            target="_blank"
            rel="noreferrer"
            className="hover:text-white flex items-center space-x-1 transition"
            title="GitHub Repository"
          >
            <Github className="w-3.5 h-3.5" />
          </a>
        </div>
      </div>
    </header>
  );
};

import React from 'react';
import { Camera, Image as ImageIcon, Cpu, Key, ShieldCheck } from 'lucide-react';

interface NavbarProps {
  activeTab: 'camera' | 'upload' | 'system';
  setActiveTab: (tab: 'camera' | 'upload' | 'system') => void;
  onOpenTokenModal: () => void;
  isBackendReady: boolean;
  activeModel: string;
  hasToken: boolean;
}

export const Navbar: React.FC<NavbarProps> = ({
  activeTab,
  setActiveTab,
  onOpenTokenModal,
  isBackendReady,
  activeModel,
  hasToken,
}) => {
  return (
    <header className="border-b border-slate-800 bg-slate-900/90 backdrop-blur sticky top-0 z-50">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
        {/* Brand */}
        <div className="flex items-center space-x-3">
          <div className="bg-sky-500/10 border border-sky-500/30 p-2 rounded-xl text-sky-400">
            <Camera className="w-5 h-5 sm:w-6 sm:h-6" />
          </div>
          <div>
            <div className="flex items-center space-x-2">
              <span className="font-bold text-base sm:text-lg text-white tracking-tight">AI Smart Camera</span>
              <span className="text-[11px] bg-sky-500/20 text-sky-400 border border-sky-500/30 font-mono px-1.5 py-0.5 rounded-full font-semibold">
                v0.2.2
              </span>
            </div>
            <p className="text-[11px] text-slate-400 hidden sm:block">Edge Computer Vision & Real-Time Stream</p>
          </div>
        </div>

        {/* Navigation Tabs */}
        <nav className="flex items-center space-x-1 sm:space-x-2">
          <button
            onClick={() => setActiveTab('camera')}
            className={`flex items-center space-x-1.5 px-2.5 sm:px-3 py-2 rounded-lg text-xs sm:text-sm font-medium transition ${
              activeTab === 'camera'
                ? 'bg-sky-600 text-white shadow-lg shadow-sky-600/30'
                : 'text-slate-300 hover:text-white hover:bg-slate-800'
            }`}
          >
            <Camera className="w-4 h-4" />
            <span className="hidden sm:inline">Live Camera</span>
          </button>

          <button
            onClick={() => setActiveTab('upload')}
            className={`flex items-center space-x-1.5 px-2.5 sm:px-3 py-2 rounded-lg text-xs sm:text-sm font-medium transition ${
              activeTab === 'upload'
                ? 'bg-sky-600 text-white shadow-lg shadow-sky-600/30'
                : 'text-slate-300 hover:text-white hover:bg-slate-800'
            }`}
          >
            <ImageIcon className="w-4 h-4" />
            <span className="hidden sm:inline">Image Analysis</span>
          </button>

          <button
            onClick={() => setActiveTab('system')}
            className={`flex items-center space-x-1.5 px-2.5 sm:px-3 py-2 rounded-lg text-xs sm:text-sm font-medium transition ${
              activeTab === 'system'
                ? 'bg-sky-600 text-white shadow-lg shadow-sky-600/30'
                : 'text-slate-300 hover:text-white hover:bg-slate-800'
            }`}
          >
            <Cpu className="w-4 h-4" />
            <span className="hidden sm:inline">System & Model</span>
          </button>
        </nav>

        {/* Status & Settings */}
        <div className="flex items-center space-x-2 sm:space-x-3">
          <div className="hidden md:flex items-center space-x-2 text-xs bg-slate-800/80 border border-slate-700 px-2.5 py-1.5 rounded-lg">
            <span
              className={`w-2 h-2 rounded-full ${
                isBackendReady ? 'bg-emerald-500 animate-pulse' : 'bg-amber-500'
              }`}
            />
            <span className="text-slate-300 font-mono">{activeModel || 'loading...'}</span>
          </div>

          <button
            onClick={onOpenTokenModal}
            title={hasToken ? 'Access Token Configured (Memory)' : 'No Token Configured (Public Mode)'}
            className={`flex items-center space-x-1.5 p-2 rounded-lg border transition ${
              hasToken
                ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-400 hover:bg-emerald-500/20'
                : 'bg-slate-800 border-slate-700 text-slate-400 hover:text-sky-400 hover:bg-slate-700'
            }`}
          >
            {hasToken ? <ShieldCheck className="w-4 h-4" /> : <Key className="w-4 h-4" />}
            <span className="text-[11px] font-medium hidden sm:inline">
              {hasToken ? 'Authenticated' : 'Token'}
            </span>
          </button>
        </div>
      </div>
    </header>
  );
};

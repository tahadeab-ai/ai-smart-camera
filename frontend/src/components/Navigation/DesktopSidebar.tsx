import React from 'react';
import { Camera, Image, Film, BarChart3, Cpu, ChevronLeft, ChevronRight, Activity, ShieldCheck, Key } from 'lucide-react';
import { AppViewTab } from '../../types';

interface DesktopSidebarProps {
  activeTab: AppViewTab;
  setActiveTab: (tab: AppViewTab) => void;
  isCollapsed: boolean;
  setIsCollapsed: (collapsed: boolean) => void;
  isBackendReady: boolean;
  activeModel: string;
  hasToken: boolean;
  onOpenTokenModal: () => void;
  isStreaming?: boolean;
}

export const DesktopSidebar: React.FC<DesktopSidebarProps> = ({
  activeTab,
  setActiveTab,
  isCollapsed,
  setIsCollapsed,
  isBackendReady,
  activeModel,
  hasToken,
  onOpenTokenModal,
  isStreaming = false,
}) => {
  const navItems: { id: AppViewTab; label: string; icon: React.ReactNode; desc: string }[] = [
    {
      id: 'camera',
      label: 'Live Camera',
      desc: 'Real-time WebSocket vision',
      icon: (
        <div className="relative">
          <Camera className="w-5 h-5" />
          {isStreaming && (
            <span className="absolute -top-1 -right-1 w-2 h-2 bg-emerald-400 rounded-full animate-ping" />
          )}
        </div>
      ),
    },
    {
      id: 'image',
      label: 'Image Analysis',
      desc: 'High-res detection & inspector',
      icon: <Image className="w-5 h-5" />,
    },
    {
      id: 'video',
      label: 'Video Analysis',
      desc: 'Batch video processing (v0.4.0)',
      icon: <Film className="w-5 h-5" />,
    },
    {
      id: 'analytics',
      label: 'Session Analytics',
      desc: 'Real-time telemetry & tracks',
      icon: <BarChart3 className="w-5 h-5" />,
    },
    {
      id: 'system',
      label: 'Models & System',
      desc: 'Weights, devices & health',
      icon: <Cpu className="w-5 h-5" />,
    },
  ];

  return (
    <aside
      className={`hidden md:flex flex-col bg-slate-900 border-r border-slate-800 transition-all duration-300 z-30 select-none ${
        isCollapsed ? 'w-20' : 'w-64'
      }`}
    >
      {/* Brand Header */}
      <div className="h-16 flex items-center justify-between px-4 border-b border-slate-800">
        <div className="flex items-center space-x-3 overflow-hidden">
          <div className="w-9 h-9 rounded-xl bg-gradient-to-tr from-emerald-600 to-sky-500 flex items-center justify-center flex-shrink-0 shadow-md shadow-emerald-950/40">
            <Activity className="w-5 h-5 text-white" />
          </div>
          {!isCollapsed && (
            <div className="leading-tight">
              <span className="font-bold text-sm tracking-wide text-white block">
                AI SMART CAMERA
              </span>
              <span className="text-[10px] text-emerald-400 font-mono font-medium">
                VISION CONTROL
              </span>
            </div>
          )}
        </div>

        <button
          onClick={() => setIsCollapsed(!isCollapsed)}
          className="text-slate-400 hover:text-white p-1 rounded-lg hover:bg-slate-800 transition"
          aria-label={isCollapsed ? 'Expand sidebar' : 'Collapse sidebar'}
        >
          {isCollapsed ? <ChevronRight className="w-4 h-4" /> : <ChevronLeft className="w-4 h-4" />}
        </button>
      </div>

      {/* Navigation Links */}
      <nav className="flex-1 py-4 px-2 space-y-1.5" aria-label="Desktop Navigation">
        {navItems.map((item) => {
          const isActive = activeTab === item.id;
          return (
            <button
              key={item.id}
              onClick={() => setActiveTab(item.id)}
              className={`w-full flex items-center rounded-xl p-2.5 transition-all text-left ${
                isActive
                  ? 'bg-emerald-500/15 text-emerald-300 font-medium shadow-sm'
                  : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/60'
              }`}
              title={isCollapsed ? item.label : undefined}
            >
              <div className="flex-shrink-0 flex items-center justify-center w-8">
                {item.icon}
              </div>
              {!isCollapsed && (
                <div className="ml-2 overflow-hidden">
                  <div className="text-sm font-semibold truncate leading-none mb-0.5">
                    {item.label}
                  </div>
                  <div className="text-[11px] text-slate-500 truncate leading-tight">
                    {item.desc}
                  </div>
                </div>
              )}
            </button>
          );
        })}
      </nav>

      {/* Footer Info & Model Pill */}
      <div className="p-3 border-t border-slate-800 space-y-2">
        {!isCollapsed ? (
          <>
            <div className="bg-slate-800/80 rounded-xl p-2.5 border border-slate-700/50 text-xs">
              <div className="flex items-center justify-between text-slate-400 mb-1.5">
                <span className="text-[10px] uppercase font-bold tracking-wider text-slate-500">
                  Active Model
                </span>
                <span
                  className={`flex items-center text-[10px] font-medium ${
                    isBackendReady ? 'text-emerald-400' : 'text-rose-400'
                  }`}
                >
                  <span
                    className={`w-1.5 h-1.5 rounded-full mr-1 ${
                      isBackendReady ? 'bg-emerald-400' : 'bg-rose-400 animate-pulse'
                    }`}
                  />
                  {isBackendReady ? 'Ready' : 'Offline'}
                </span>
              </div>
              <div className="font-mono text-white text-xs font-semibold truncate">
                {activeModel}
              </div>
            </div>

            <button
              onClick={onOpenTokenModal}
              className={`w-full flex items-center justify-between px-3 py-2 rounded-xl text-xs font-medium transition ${
                hasToken
                  ? 'bg-slate-800 text-slate-300 hover:bg-slate-700'
                  : 'bg-amber-500/10 border border-amber-500/30 text-amber-300 hover:bg-amber-500/20'
              }`}
            >
              <span className="flex items-center space-x-1.5">
                {hasToken ? <ShieldCheck className="w-3.5 h-3.5 text-emerald-400" /> : <Key className="w-3.5 h-3.5" />}
                <span>{hasToken ? 'Access Token Set' : 'Set Token'}</span>
              </span>
              <span className="text-[10px] text-slate-500 font-mono">Edit</span>
            </button>
          </>
        ) : (
          <div className="flex flex-col items-center space-y-2 py-1">
            <span
              className={`w-3 h-3 rounded-full ${
                isBackendReady ? 'bg-emerald-400' : 'bg-rose-400 animate-pulse'
              }`}
              title={isBackendReady ? 'Backend Ready' : 'Backend Offline'}
            />
            <button
              onClick={onOpenTokenModal}
              className="text-slate-400 hover:text-white p-1"
              title="Token Settings"
            >
              <Key className="w-4 h-4" />
            </button>
          </div>
        )}
      </div>
    </aside>
  );
};

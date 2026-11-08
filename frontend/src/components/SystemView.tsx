import React, { useEffect, useState } from 'react';
import {
  Cpu,
  HardDrive,
  Layers,
  CheckCircle2,
  AlertCircle,
  RefreshCw,
  Server,
  Zap,
} from 'lucide-react';
import { ApiClient } from '../api/client';
import { ModelInfo, SystemInfo } from '../types';

interface SystemViewProps {
  onModelSwitched?: (modelName: string) => void;
}

export const SystemView: React.FC<SystemViewProps> = ({ onModelSwitched }) => {
  const [systemInfo, setSystemInfo] = useState<SystemInfo | null>(null);
  const [models, setModels] = useState<ModelInfo[]>([]);
  const [activeModel, setActiveModel] = useState<string>('');
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [isSwitching, setIsSwitching] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const fetchData = async () => {
    setIsLoading(true);
    setError(null);
    try {
      const [sys, mod] = await Promise.all([
        ApiClient.getSystemInfo(),
        ApiClient.getModels(),
      ]);
      setSystemInfo(sys);
      setModels(mod.models);
      setActiveModel(mod.active_model);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      setError(`Failed to retrieve system status: ${msg}`);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

  const handleSwitchModel = async (modelName: string) => {
    setIsSwitching(modelName);
    setError(null);
    try {
      await ApiClient.switchModel(modelName);
      setActiveModel(modelName);
      if (onModelSwitched) onModelSwitched(modelName);
      await fetchData();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      setError(`Model switch error: ${msg}`);
    } finally {
      setIsSwitching(null);
    }
  };

  return (
    <div className="space-y-6">
      {/* Header & Refresh */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-bold text-white">System Telemetry & Architecture</h2>
          <p className="text-xs text-slate-400">
            Runtime environment details, active streams, and thread-safe YOLO model manager.
          </p>
        </div>
        <button
          onClick={fetchData}
          disabled={isLoading}
          className="flex items-center space-x-1.5 bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs px-3 py-2 rounded-lg border border-slate-700 transition"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${isLoading ? 'animate-spin' : ''}`} />
          <span>Refresh</span>
        </button>
      </div>

      {error && (
        <div className="p-3 bg-rose-500/10 border border-rose-500/30 rounded-xl text-rose-300 text-xs flex items-center space-x-2">
          <AlertCircle className="w-4 h-4 text-rose-400 flex-shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {/* Hardware Telemetry Cards */}
      {systemInfo && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <div className="bg-slate-900 border border-slate-800 p-4 rounded-xl space-y-2">
            <div className="flex items-center space-x-2 text-slate-400 text-xs font-medium">
              <Server className="w-4 h-4 text-sky-400" />
              <span>Platform OS</span>
            </div>
            <div className="text-sm font-semibold text-white font-mono truncate">
              {systemInfo.platform}
            </div>
            <div className="text-[11px] text-slate-500 font-mono">
              Python {systemInfo.python_version}
            </div>
          </div>

          <div className="bg-slate-900 border border-slate-800 p-4 rounded-xl space-y-2">
            <div className="flex items-center space-x-2 text-slate-400 text-xs font-medium">
              <Zap className="w-4 h-4 text-emerald-400" />
              <span>Inference Hardware (Detected)</span>
            </div>
            <div className="text-sm font-semibold text-white font-mono flex items-center space-x-2">
              <span>{systemInfo.device.toUpperCase()}</span>
              {systemInfo.cuda_available && (
                <span className="bg-emerald-500/20 text-emerald-300 text-[10px] px-1.5 py-0.5 rounded font-mono border border-emerald-500/30">
                  CUDA
                </span>
              )}
            </div>
            <div className="text-[11px] text-slate-500 font-mono">
              PyTorch {systemInfo.torch_version} &bull; Read-only
            </div>
          </div>

          <div className="bg-slate-900 border border-slate-800 p-4 rounded-xl space-y-2">
            <div className="flex items-center space-x-2 text-slate-400 text-xs font-medium">
              <Cpu className="w-4 h-4 text-indigo-400" />
              <span>Host CPU Cores</span>
            </div>
            <div className="text-sm font-semibold text-white font-mono">
              {systemInfo.cpu_count} Logical Cores
            </div>
            <div className="text-[11px] text-slate-500">
              {systemInfo.memory_available_gb
                ? `${systemInfo.memory_available_gb}GB / ${systemInfo.memory_total_gb}GB RAM Available`
                : 'Standard Colab / Docker Host'}
            </div>
          </div>

          <div className="bg-slate-900 border border-slate-800 p-4 rounded-xl space-y-2">
            <div className="flex items-center space-x-2 text-slate-400 text-xs font-medium">
              <Layers className="w-4 h-4 text-amber-400" />
              <span>Active Streams</span>
            </div>
            <div className="text-sm font-semibold text-white font-mono">
              {systemInfo.active_stream_count} Concurrent Session(s)
            </div>
            <div className="text-[11px] text-slate-500 font-mono">
              Active Model: {systemInfo.active_model}
            </div>
          </div>
        </div>
      )}

      {/* Model Catalog & Switcher */}
      <div className="space-y-4">
        <h3 className="text-base font-bold text-white flex items-center space-x-2">
          <HardDrive className="w-4 h-4 text-sky-400" />
          <span>Available YOLO Models (Hot-Swappable)</span>
        </h3>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {models.map((mod) => {
            const isActive = mod.name === activeModel;
            const switchingThis = isSwitching === mod.name;

            return (
              <div
                key={mod.name}
                className={`p-5 rounded-2xl border transition relative ${
                  isActive
                    ? 'bg-slate-900/90 border-sky-500/80 shadow-lg shadow-sky-500/10'
                    : 'bg-slate-900/50 border-slate-800 hover:border-slate-700'
                }`}
              >
                <div className="flex items-start justify-between">
                  <div>
                    <div className="flex items-center space-x-2">
                      <h4 className="font-bold text-white text-base font-mono">{mod.name}</h4>
                      <span className="text-[10px] bg-slate-800 text-slate-300 border border-slate-700 px-1.5 py-0.5 rounded font-mono">
                        {mod.license}
                      </span>
                    </div>
                    <p className="text-xs text-slate-400 mt-1">{mod.description}</p>
                  </div>

                  {isActive ? (
                    <span className="inline-flex items-center space-x-1 bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 text-xs font-mono font-semibold px-2.5 py-1 rounded-full">
                      <CheckCircle2 className="w-3.5 h-3.5" />
                      <span>ACTIVE</span>
                    </span>
                  ) : (
                    <button
                      onClick={() => handleSwitchModel(mod.name)}
                      disabled={switchingThis || !!isSwitching}
                      className="bg-slate-800 hover:bg-sky-600 text-slate-200 hover:text-white border border-slate-700 text-xs font-medium px-3 py-1.5 rounded-lg transition disabled:opacity-50"
                    >
                      {switchingThis ? 'Switching...' : 'Switch Model'}
                    </button>
                  )}
                </div>

                <div className="mt-4 pt-3 border-t border-slate-800/80 flex flex-wrap items-center justify-between text-xs text-slate-400 font-mono">
                  <span>Size: {mod.size_mb} MB</span>
                  <span className="text-[11px] truncate max-w-[200px]" title={mod.checksum_sha256}>
                    SHA-256: {mod.checksum_sha256.substring(0, 12)}...
                  </span>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
};

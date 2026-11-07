import React, { useEffect, useState } from 'react';
import { Navbar } from './components/Navbar';
import { LiveCameraView } from './components/LiveCameraView';
import { ImageAnalysisView } from './components/ImageAnalysisView';
import { SystemView } from './components/SystemView';
import { TokenModal } from './components/TokenModal';
import { ApiClient } from './api/client';
import { Github, ExternalLink } from 'lucide-react';

export const App: React.FC = () => {
  const [activeTab, setActiveTab] = useState<'camera' | 'upload' | 'system'>('camera');
  const [isTokenModalOpen, setIsTokenModalOpen] = useState<boolean>(false);
  const [isBackendReady, setIsBackendReady] = useState<boolean>(false);
  const [activeModel, setActiveModel] = useState<string>('yolov8n');

  const checkBackend = async () => {
    try {
      await ApiClient.getHealth();
      setIsBackendReady(true);
      const models = await ApiClient.getModels();
      setActiveModel(models.active_model);
    } catch {
      setIsBackendReady(false);
    }
  };

  useEffect(() => {
    checkBackend();
    const interval = setInterval(checkBackend, 15000);
    return () => clearInterval(interval);
  }, []);

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col font-sans selection:bg-sky-500 selection:text-white">
      {/* Top Navigation */}
      <Navbar
        activeTab={activeTab}
        setActiveTab={setActiveTab}
        onOpenTokenModal={() => setIsTokenModalOpen(true)}
        isBackendReady={isBackendReady}
        activeModel={activeModel}
      />

      {/* Main Content Area */}
      <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {activeTab === 'camera' && <LiveCameraView />}
        {activeTab === 'upload' && <ImageAnalysisView />}
        {activeTab === 'system' && (
          <SystemView onModelSwitched={(model) => setActiveModel(model)} />
        )}
      </main>

      {/* Access Token Configuration Modal */}
      <TokenModal
        isOpen={isTokenModalOpen}
        onClose={() => setIsTokenModalOpen(false)}
        onSaved={checkBackend}
      />

      {/* Footer */}
      <footer className="border-t border-slate-900 bg-slate-950/80 py-6 mt-auto">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 flex flex-col sm:flex-row items-center justify-between gap-4 text-xs text-slate-500">
          <div className="flex items-center space-x-2">
            <span className="font-semibold text-slate-400">AI Smart Camera v0.2.0</span>
            <span>&bull;</span>
            <span>FastAPI + React + YOLO & Supervision</span>
          </div>

          <div className="flex items-center space-x-4">
            <a
              href="/docs"
              target="_blank"
              rel="noreferrer"
              className="hover:text-sky-400 flex items-center space-x-1 transition"
            >
              <span>Swagger API</span>
              <ExternalLink className="w-3 h-3" />
            </a>

            <a
              href="https://github.com/tahadeab-ai/ai-smart-camera"
              target="_blank"
              rel="noreferrer"
              className="hover:text-white flex items-center space-x-1 transition"
            >
              <Github className="w-4 h-4" />
              <span>GitHub Repository</span>
            </a>
          </div>
        </div>
      </footer>
    </div>
  );
};

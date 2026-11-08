import React, { useEffect, useState, useCallback } from 'react';
import { DesktopSidebar } from './components/Navigation/DesktopSidebar';
import { MobileNavBar } from './components/Navigation/MobileNavBar';
import { TopHeader } from './components/Navigation/TopHeader';
import { LiveCameraView } from './components/LiveCameraView';
import { ImageAnalysisView } from './components/ImageAnalysisView';
import { VideoAnalysisView } from './components/VideoAnalysisView';
import { SessionAnalyticsView } from './components/SessionAnalyticsView';
import { SystemView } from './components/SystemView';
import { TokenModal } from './components/TokenModal';
import { ApiClient } from './api/client';
import { AppViewTab, SessionAnalyticsData } from './types';

const INITIAL_ANALYTICS: SessionAnalyticsData = {
  totalFrames: 0,
  processedFrames: 0,
  droppedFrames: 0,
  avgLatencyMs: 0,
  avgFps: 0,
  classDistribution: {},
  trackedCount: 0,
  maxConcurrentTracked: 0,
  startTime: 0,
};

export const App: React.FC = () => {
  const [activeTab, setActiveTab] = useState<AppViewTab>('camera');
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState<boolean>(false);
  const [isTokenModalOpen, setIsTokenModalOpen] = useState<boolean>(false);
  const [isBackendReady, setIsBackendReady] = useState<boolean>(false);
  const [activeModel, setActiveModel] = useState<string>('yolov8n');
  const [hasToken, setHasToken] = useState<boolean>(ApiClient.hasToken());
  const [isStreaming, setIsStreaming] = useState<boolean>(false);
  const [sessionAnalytics, setSessionAnalytics] = useState<SessionAnalyticsData>(INITIAL_ANALYTICS);

  const checkBackend = useCallback(async () => {
    try {
      await ApiClient.getHealth();
      setIsBackendReady(true);
      const models = await ApiClient.getModels();
      setActiveModel(models.active_model);
    } catch {
      setIsBackendReady(false);
    }
  }, []);

  useEffect(() => {
    const unsubscribe = ApiClient.onTokenChange((tokenSet) => {
      setHasToken(tokenSet);
    });
    return unsubscribe;
  }, []);

  useEffect(() => {
    checkBackend();
    const interval = setInterval(checkBackend, 15000);
    return () => clearInterval(interval);
  }, [checkBackend]);

  const handleTelemetryUpdate = useCallback((data: SessionAnalyticsData) => {
    setSessionAnalytics(data);
  }, []);

  const handleResetSession = useCallback(() => {
    setSessionAnalytics({
      ...INITIAL_ANALYTICS,
      startTime: Date.now(),
    });
  }, []);

  return (
    <div className="flex h-screen w-screen bg-slate-950 text-slate-100 font-sans overflow-hidden selection:bg-emerald-500 selection:text-white">
      {/* Desktop Sidebar (Collapsible, hidden on mobile) */}
      <DesktopSidebar
        activeTab={activeTab}
        setActiveTab={setActiveTab}
        isCollapsed={isSidebarCollapsed}
        setIsCollapsed={setIsSidebarCollapsed}
        isBackendReady={isBackendReady}
        activeModel={activeModel}
        hasToken={hasToken}
        onOpenTokenModal={() => setIsTokenModalOpen(true)}
        isStreaming={isStreaming}
      />

      {/* Main App Container */}
      <div className="flex-1 flex flex-col min-w-0 h-full overflow-hidden">
        {/* Top Header */}
        <TopHeader
          activeTab={activeTab}
          isBackendReady={isBackendReady}
          activeModel={activeModel}
          hasToken={hasToken}
          onOpenTokenModal={() => setIsTokenModalOpen(true)}
        />

        {/* Viewport Content Area */}
        <main className="flex-1 min-h-0 overflow-y-auto p-2 sm:p-4 md:p-6 pb-20 md:pb-6">
          {activeTab === 'camera' && (
            <LiveCameraView
              onTelemetryUpdate={handleTelemetryUpdate}
              onStreamingStateChange={setIsStreaming}
            />
          )}

          {activeTab === 'image' && <ImageAnalysisView />}

          {activeTab === 'video' && <VideoAnalysisView />}

          {activeTab === 'analytics' && (
            <SessionAnalyticsView
              analyticsData={sessionAnalytics}
              onResetSession={handleResetSession}
              isStreaming={isStreaming}
            />
          )}

          {activeTab === 'system' && (
            <SystemView onModelSwitched={(model) => setActiveModel(model)} />
          )}
        </main>

        {/* Mobile Navigation Bar (Fixed bottom, hidden on desktop) */}
        <MobileNavBar
          activeTab={activeTab}
          setActiveTab={setActiveTab}
          isStreaming={isStreaming}
        />
      </div>

      {/* Access Token Configuration Modal */}
      <TokenModal
        isOpen={isTokenModalOpen}
        onClose={() => setIsTokenModalOpen(false)}
        onSaved={checkBackend}
      />
    </div>
  );
};

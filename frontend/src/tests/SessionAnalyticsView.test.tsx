import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { SessionAnalyticsView } from '../components/SessionAnalyticsView';
import { SessionAnalyticsData } from '../types';

describe('SessionAnalyticsView Component', () => {
  const sampleAnalytics: SessionAnalyticsData = {
    totalFrames: 100,
    totalSent: 100,
    captureBusyDrops: 5,
    bufferCongestedDrops: 3,
    sendFailedDrops: 2,
    clientDroppedFrames: 10,
    serverDroppedFrames: 4,
    processedFrames: 96,
    displayedFrames: 90,
    droppedFrames: 14,
    avgLatencyMs: 28.5,
    avgFps: 18.2, // Display render FPS
    avgServerFps: 24.5, // Server inference FPS
    classDistribution: { person: 120, car: 45 },
    trackedCount: 6,
    maxConcurrentTracked: 8,
    startTime: Date.now() - 60000,
  };

  it('renders processed and displayed frame counts without fallback substitution', () => {
    render(<SessionAnalyticsView analyticsData={sampleAnalytics} onResetSession={vi.fn()} />);

    // Check processed / displayed rendered text
    expect(screen.getByText('96')).toBeDefined();
    expect(screen.getByText('/ 90')).toBeDefined();
  });

  it('renders server and client drop counts independently', () => {
    render(<SessionAnalyticsView analyticsData={sampleAnalytics} onResetSession={vi.fn()} />);

    // Total drops = 14
    expect(screen.getByText('14')).toBeDefined();
    // Server drops = 4
    expect(screen.getByText('4')).toBeDefined();
    // Client drops = 10
    expect(screen.getByText('10')).toBeDefined();
  });

  it('displays server inference FPS and display render FPS distinctly', () => {
    render(<SessionAnalyticsView analyticsData={sampleAnalytics} onResetSession={vi.fn()} />);

    expect(screen.getByText(/Server Inference/i)).toBeDefined();
    expect(screen.getByText(/24.5/i)).toBeDefined();

    expect(screen.getByText(/Display Render/i)).toBeDefined();
    expect(screen.getByText(/18.2/i)).toBeDefined();
  });
});

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { LiveCameraView } from '../components/LiveCameraView';

describe('LiveCameraView Component', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('renders standby screen with Start Stream button', () => {
    render(<LiveCameraView />);
    expect(screen.getByText(/Camera Feed Ready/i)).toBeDefined();
    expect(screen.getByText(/Start Stream/i)).toBeDefined();
    expect(screen.getByText(/STANDBY/i)).toBeDefined();
  });

  it('opens and closes settings drawer', () => {
    render(<LiveCameraView />);

    // Click Settings
    const settingsBtn = screen.getByText(/Settings/i);
    fireEvent.click(settingsBtn);

    expect(screen.getByText(/Vision & Pipeline Tuning/i)).toBeDefined();
    expect(screen.getByText(/Multi-Object Tracking \(ByteTrack\)/i)).toBeDefined();

    // Close settings
    const closeBtn = screen.getByText(/Close Settings/i);
    fireEvent.click(closeBtn);

    expect(screen.queryByText(/Vision & Pipeline Tuning/i)).toBeNull();
  });

  it('calls onStreamingStateChange(false) on unmount', () => {
    const onStreamingStateChange = vi.fn();
    const { unmount } = render(
      <LiveCameraView onStreamingStateChange={onStreamingStateChange} />
    );

    // Initial call
    expect(onStreamingStateChange).toHaveBeenCalledWith(false);

    unmount();
    expect(onStreamingStateChange).toHaveBeenLastCalledWith(false);
  });
});

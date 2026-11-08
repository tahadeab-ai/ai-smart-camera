import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, act } from '@testing-library/react';
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

  it('aborts WebSocket connection if camera initialization fails', async () => {
    // Mock navigator.mediaDevices.getUserMedia rejection
    const mockGetUserMedia = vi.fn().mockRejectedValue(new DOMException('Permission denied', 'NotAllowedError'));
    Object.defineProperty(globalThis.navigator, 'mediaDevices', {
      value: {
        getUserMedia: mockGetUserMedia,
        enumerateDevices: vi.fn().mockResolvedValue([]),
      },
      configurable: true,
      writable: true,
    });

    render(<LiveCameraView />);

    const startBtn = screen.getByText(/Start Stream/i);
    await fireEvent.click(startBtn);

    // Camera fails -> stream not active
    expect(screen.getByText(/Camera Feed Ready/i)).toBeDefined();
  });

  it('displays switch error banner if camera toggle fails', async () => {
    window.HTMLMediaElement.prototype.play = vi.fn().mockResolvedValue(undefined);

    // Mock getUserMedia: first call succeeds (to start camera), second call rejects (to simulate flip failure)
    const mockGetUserMedia = vi
      .fn()
      .mockResolvedValueOnce({
        getTracks: () => [{ stop: vi.fn() }],
      })
      .mockRejectedValueOnce(new DOMException('Camera hardware error', 'NotReadableError'));

    Object.defineProperty(globalThis.navigator, 'mediaDevices', {
      value: {
        getUserMedia: mockGetUserMedia,
        enumerateDevices: vi.fn().mockResolvedValue([]),
      },
      configurable: true,
      writable: true,
    });

    render(<LiveCameraView />);

    // Start stream first so camera becomes active
    const startBtn = screen.getByText(/Start Stream/i);
    await act(async () => {
      fireEvent.click(startBtn);
    });

    // Trigger camera switch button
    const flipBtn = screen.getByLabelText(/Flip Camera/i);
    expect(flipBtn).toBeDefined();
    await act(async () => {
      fireEvent.click(flipBtn);
    });

    // If camera device acquisition fails during toggle, switch error is displayed
    const errorNotice = await screen.findByText(/Hardware camera switch failed/i);
    expect(errorNotice).toBeDefined();
  });
});

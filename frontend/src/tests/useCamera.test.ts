import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useCamera } from '../hooks/useCamera';

describe('useCamera', () => {
  let mockTrack: { stop: any };
  let mockStream: { getTracks: any };
  let mockGetUserMedia: any;

  beforeEach(() => {
    mockTrack = {
      stop: vi.fn(),
    };
    mockStream = {
      getTracks: vi.fn(() => [mockTrack]),
    };
    mockGetUserMedia = vi.fn().mockResolvedValue(mockStream);

    const mockMediaDevices = {
      enumerateDevices: vi.fn().mockResolvedValue([
        { kind: 'videoinput', deviceId: 'cam-1', label: 'Front Camera' },
        { kind: 'videoinput', deviceId: 'cam-2', label: 'Back Camera' },
      ]),
      getUserMedia: mockGetUserMedia,
    };

    vi.stubGlobal('navigator', {
      mediaDevices: mockMediaDevices,
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it('initializes in inactive state', () => {
    const { result } = renderHook(() => useCamera());
    expect(result.current.isActive).toBe(false);
    expect(result.current.isTransitioning).toBe(false);
    expect(result.current.facingMode).toBe('user');
    expect(result.current.error).toBeNull();
  });

  it('toggles facing mode when inactive without calling getUserMedia', async () => {
    const { result } = renderHook(() => useCamera());

    await act(async () => {
      result.current.setSelectedDeviceId('cam-1');
      await result.current.toggleFacingMode();
    });

    expect(result.current.facingMode).toBe('environment');
    expect(result.current.selectedDeviceId).toBe('');
    expect(mockGetUserMedia).not.toHaveBeenCalled();
  });

  it('executes hardware stream transition when toggling facing mode while active', async () => {
    const { result } = renderHook(() => useCamera());

    // 1. Start camera
    await act(async () => {
      await result.current.startCamera();
    });
    expect(result.current.isActive).toBe(true);
    expect(mockGetUserMedia).toHaveBeenCalledTimes(1);

    // 2. Toggle camera while active
    await act(async () => {
      await result.current.toggleFacingMode();
    });

    // Verify old track was stopped and getUserMedia called again with environment facing mode
    expect(mockTrack.stop).toHaveBeenCalled();
    expect(result.current.facingMode).toBe('environment');
    expect(mockGetUserMedia).toHaveBeenCalledTimes(2);
    expect(result.current.isActive).toBe(true);
  });

  it('falls back to facingMode constraint if deviceId causes OverconstrainedError', async () => {
    const overconstrainedErr = new DOMException('Constraint not satisfied', 'OverconstrainedError');
    mockGetUserMedia
      .mockRejectedValueOnce(overconstrainedErr)
      .mockResolvedValueOnce(mockStream);

    const { result } = renderHook(() => useCamera());

    await act(async () => {
      result.current.setSelectedDeviceId('cam-1');
      await result.current.startCamera();
    });

    expect(mockGetUserMedia).toHaveBeenCalledTimes(2);
    expect(result.current.isActive).toBe(true);
  });

  it('stops camera cleanly and clears active tracks', async () => {
    const { result } = renderHook(() => useCamera());

    await act(async () => {
      await result.current.startCamera();
    });
    expect(result.current.isActive).toBe(true);

    act(() => {
      result.current.stopCamera();
    });

    expect(mockTrack.stop).toHaveBeenCalled();
    expect(result.current.isActive).toBe(false);
  });
});

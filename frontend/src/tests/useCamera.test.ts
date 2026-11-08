import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useCamera } from '../hooks/useCamera';

describe('useCamera', () => {
  beforeEach(() => {
    const mockTrack = {
      stop: vi.fn(),
    };
    const mockStream = {
      getTracks: vi.fn(() => [mockTrack]),
    };

    const mockMediaDevices = {
      enumerateDevices: vi.fn().mockResolvedValue([
        { kind: 'videoinput', deviceId: 'cam-1', label: 'Front Camera' },
        { kind: 'videoinput', deviceId: 'cam-2', label: 'Back Camera' },
      ]),
      getUserMedia: vi.fn().mockResolvedValue(mockStream),
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
    expect(result.current.facingMode).toBe('user');
    expect(result.current.error).toBeNull();
  });

  it('toggles facing mode and resets selected device', () => {
    const { result } = renderHook(() => useCamera());

    act(() => {
      result.current.setSelectedDeviceId('cam-1');
      result.current.toggleFacingMode();
    });

    expect(result.current.facingMode).toBe('environment');
    expect(result.current.selectedDeviceId).toBe('');
  });
});

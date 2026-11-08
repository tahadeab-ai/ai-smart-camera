import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { ApiClient } from '../api/client';

describe('ApiClient', () => {
  beforeEach(() => {
    ApiClient.setToken(null);
    vi.restoreAllMocks();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('manages tokens strictly in memory and never touches localStorage', () => {
    expect(ApiClient.getToken()).toBeNull();
    expect(ApiClient.hasToken()).toBe(false);

    ApiClient.setToken('test-token-xyz');
    expect(ApiClient.getToken()).toBe('test-token-xyz');
    expect(ApiClient.hasToken()).toBe(true);

    // Verify localStorage was not populated
    expect(localStorage.getItem('ai_cam_token')).toBeNull();

    ApiClient.clearToken();
    expect(ApiClient.getToken()).toBeNull();
    expect(ApiClient.hasToken()).toBe(false);
  });

  it('notifies listeners when token changes', () => {
    const listener = vi.fn();
    const unsub = ApiClient.onTokenChange(listener);

    ApiClient.setToken('new-token');
    expect(listener).toHaveBeenCalledWith(true);

    ApiClient.clearToken();
    expect(listener).toHaveBeenCalledWith(false);

    unsub();
  });

  it('fetches health status', async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ status: 'ok', version: '0.2.2' }),
    } as Response);
    vi.stubGlobal('fetch', mockFetch);

    const health = await ApiClient.getHealth();
    expect(health.status).toBe('ok');
    expect(health.version).toBe('0.2.2');
    expect(mockFetch).toHaveBeenCalledWith('/api/v1/health/live');
  });

  it('fetches system version and git commit sha', async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ version: '0.2.2', commit_sha: 'a46c046' }),
    } as Response);
    vi.stubGlobal('fetch', mockFetch);

    const ver = await ApiClient.getVersion();
    expect(ver.version).toBe('0.2.2');
    expect(ver.commit_sha).toBe('a46c046');
    expect(mockFetch).toHaveBeenCalledWith('/api/v1/system/version');
  });

  it('requests WebSocket ticket with auth header', async () => {
    ApiClient.setToken('auth-secret');
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ ticket: 'single-use-ticket-123', expires_in: 30 }),
    } as Response);
    vi.stubGlobal('fetch', mockFetch);

    const res = await ApiClient.getWsTicket();
    expect(res.ticket).toBe('single-use-ticket-123');
    expect(res.expires_in).toBe(30);
    expect(mockFetch).toHaveBeenCalledWith(
      '/api/v1/auth/ws-ticket',
      expect.objectContaining({
        method: 'POST',
        headers: expect.objectContaining({ 'X-Access-Token': 'auth-secret' }),
      })
    );
  });

  it('throws friendly error on 401 Unauthorized', async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 401,
      statusText: 'Unauthorized',
      json: async () => ({
        error: { code: 'UNAUTHORIZED', message: 'Invalid or missing token.' },
      }),
    } as unknown as Response);
    vi.stubGlobal('fetch', mockFetch);

    await expect(ApiClient.getSystemInfo()).rejects.toThrow('Invalid or missing token.');
  });
});

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { ApiClient } from '../api/client';

describe('ApiClient', () => {
  beforeEach(() => {
    ApiClient.setToken(null);
    vi.restoreAllMocks();
  });

  it('manages tokens in memory and headers', () => {
    expect(ApiClient.getToken()).toBeNull();
    ApiClient.setToken('test-token-xyz');
    expect(ApiClient.getToken()).toBe('test-token-xyz');
  });

  it('fetches health status', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ status: 'ok', version: '0.2.1' }),
    } as Response);

    const health = await ApiClient.getHealth();
    expect(health.status).toBe('ok');
    expect(health.version).toBe('0.2.1');
    expect(global.fetch).toHaveBeenCalledWith('/api/v1/health/live');
  });

  it('requests WebSocket ticket with auth header', async () => {
    ApiClient.setToken('auth-secret');
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ ticket: 'single-use-ticket-123', expires_in: 30 }),
    } as Response);

    const res = await ApiClient.getWsTicket();
    expect(res.ticket).toBe('single-use-ticket-123');
    expect(res.expires_in).toBe(30);
    expect(global.fetch).toHaveBeenCalledWith(
      '/api/v1/auth/ws-ticket',
      expect.objectContaining({
        method: 'POST',
        headers: expect.objectContaining({ 'X-Access-Token': 'auth-secret' }),
      })
    );
  });
});

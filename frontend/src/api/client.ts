import {
  ImageDetectionResponse,
  ModelListResponse,
  SystemInfo,
} from '../types';

let inMemoryToken: string | null = null;
const tokenChangeListeners: Array<(hasToken: boolean) => void> = [];

export class ApiClient {
  /**
   * Strictly store token in-memory only.
   * Never persist to localStorage, sessionStorage, or cookies.
   */
  static setToken(token: string | null): void {
    inMemoryToken = token && token.trim() ? token.trim() : null;
    tokenChangeListeners.forEach((listener) => {
      try {
        listener(Boolean(inMemoryToken));
      } catch (err) {
        console.warn('Error in token change listener:', err);
      }
    });
  }

  static clearToken(): void {
    this.setToken(null);
  }

  static getToken(): string | null {
    return inMemoryToken;
  }

  static hasToken(): boolean {
    return inMemoryToken !== null;
  }

  static onTokenChange(listener: (hasToken: boolean) => void): () => void {
    tokenChangeListeners.push(listener);
    return () => {
      const idx = tokenChangeListeners.indexOf(listener);
      if (idx !== -1) tokenChangeListeners.splice(idx, 1);
    };
  }

  private static getHeaders(extraHeaders: HeadersInit = {}): HeadersInit {
    const token = this.getToken();
    const headers: Record<string, string> = { ...extraHeaders } as Record<string, string>;
    if (token) {
      headers['X-Access-Token'] = token;
    }
    return headers;
  }

  private static async handleResponseError(res: Response, fallbackPrefix: string): Promise<never> {
    const err = await res.json().catch(() => ({}));
    if (res.status === 401 || res.status === 403) {
      throw new Error(
        err.error?.message || 'Authentication required: Invalid or missing access token.'
      );
    }
    throw new Error(err.error?.message || `${fallbackPrefix}: ${res.statusText}`);
  }

  static async getHealth(): Promise<{ status: string; version: string }> {
    const res = await fetch('/api/v1/health/live');
    if (!res.ok) {
      return this.handleResponseError(res, 'Health check failed');
    }
    return res.json();
  }

  static async getVersion(): Promise<{ version: string; commit_sha: string }> {
    const res = await fetch('/api/v1/system/version');
    if (!res.ok) {
      return this.handleResponseError(res, 'Version check failed');
    }
    return res.json();
  }

  static async getSystemInfo(): Promise<SystemInfo> {
    const res = await fetch('/api/v1/system/info', {
      headers: this.getHeaders(),
    });
    if (!res.ok) {
      return this.handleResponseError(res, 'Failed to load system info');
    }
    return res.json();
  }

  static async getModels(): Promise<ModelListResponse> {
    const res = await fetch('/api/v1/models', {
      headers: this.getHeaders(),
    });
    if (!res.ok) {
      return this.handleResponseError(res, 'Failed to load models');
    }
    return res.json();
  }

  static async switchModel(modelName: string, device?: string): Promise<void> {
    const res = await fetch('/api/v1/models/switch', {
      method: 'POST',
      headers: this.getHeaders({ 'Content-Type': 'application/json' }),
      body: JSON.stringify({ model_name: modelName, device }),
    });
    if (!res.ok) {
      return this.handleResponseError(res, 'Failed to switch model');
    }
  }

  static async getWsTicket(): Promise<{ ticket: string; expires_in: number }> {
    const res = await fetch('/api/v1/auth/ws-ticket', {
      method: 'POST',
      headers: this.getHeaders(),
    });
    if (!res.ok) {
      return this.handleResponseError(res, 'Failed to acquire WS ticket');
    }
    return res.json();
  }

  static async detectImage(
    file: File,
    confidence: number = 0.25,
    iouThreshold: number = 0.45,
    filterClasses?: string[]
  ): Promise<ImageDetectionResponse> {
    const formData = new FormData();
    formData.append('file', file);
    formData.append('confidence', confidence.toString());
    formData.append('iou_threshold', iouThreshold.toString());
    if (filterClasses && filterClasses.length > 0) {
      formData.append('filter_classes', filterClasses.join(','));
    }

    const res = await fetch('/api/v1/detect/image', {
      method: 'POST',
      headers: this.getHeaders(),
      body: formData,
    });

    if (!res.ok) {
      return this.handleResponseError(res, 'Image detection failed');
    }

    return res.json();
  }
}

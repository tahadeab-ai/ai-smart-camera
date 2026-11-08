import {
  ImageDetectionResponse,
  ModelListResponse,
  SystemInfo,
} from '../types';

let inMemoryToken: string | null = null;

export class ApiClient {
  static setToken(token: string | null): void {
    inMemoryToken = token;
    if (token) {
      try {
        localStorage.setItem('ai_cam_token', token);
      } catch {
        // LocalStorage might be disabled in private mode
      }
    } else {
      try {
        localStorage.removeItem('ai_cam_token');
      } catch {
        // Ignore
      }
    }
  }

  static getToken(): string | null {
    if (inMemoryToken) return inMemoryToken;
    try {
      return localStorage.getItem('ai_cam_token');
    } catch {
      return null;
    }
  }

  private static getHeaders(extraHeaders: HeadersInit = {}): HeadersInit {
    const token = this.getToken();
    const headers: Record<string, string> = { ...extraHeaders } as Record<string, string>;
    if (token) {
      headers['X-Access-Token'] = token;
    }
    return headers;
  }

  static async getHealth(): Promise<{ status: string; version: string }> {
    const res = await fetch('/api/v1/health/live');
    if (!res.ok) throw new Error(`Health check failed: ${res.statusText}`);
    return res.json();
  }

  static async getSystemInfo(): Promise<SystemInfo> {
    const res = await fetch('/api/v1/system/info', {
      headers: this.getHeaders(),
    });
    if (!res.ok) throw new Error(`Failed to load system info: ${res.statusText}`);
    return res.json();
  }

  static async getModels(): Promise<ModelListResponse> {
    const res = await fetch('/api/v1/models', {
      headers: this.getHeaders(),
    });
    if (!res.ok) throw new Error(`Failed to load models: ${res.statusText}`);
    return res.json();
  }

  static async switchModel(modelName: string, device?: string): Promise<void> {
    const res = await fetch('/api/v1/models/switch', {
      method: 'POST',
      headers: this.getHeaders({ 'Content-Type': 'application/json' }),
      body: JSON.stringify({ model_name: modelName, device }),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.error?.message || `Failed to switch model: ${res.statusText}`);
    }
  }

  static async getWsTicket(): Promise<{ ticket: string; expires_in: number }> {
    const res = await fetch('/api/v1/auth/ws-ticket', {
      method: 'POST',
      headers: this.getHeaders(),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.error?.message || `Failed to acquire WS ticket: ${res.statusText}`);
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
      const err = await res.json().catch(() => ({}));
      throw new Error(err.error?.message || `Detection failed: ${res.statusText}`);
    }

    return res.json();
  }
}

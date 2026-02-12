/**
 * API Client for ReplyForce AI Backend.
 * Handles authentication, request/response formatting, and error handling.
 */

const API_BASE = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001/api/v1';

interface ApiOptions {
  method?: string;
  body?: any;
  headers?: Record<string, string>;
}

class ApiClient {
  private baseUrl: string;

  constructor(baseUrl: string) {
    this.baseUrl = baseUrl;
  }

  private getToken(): string | null {
    if (typeof window === 'undefined') return null;
    return localStorage.getItem('accessToken');
  }

  private async request<T>(endpoint: string, options: ApiOptions = {}): Promise<T> {
    const token = this.getToken();
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      ...options.headers,
    };

    if (token) {
      headers.Authorization = `Bearer ${token}`;
    }

    const response = await fetch(`${this.baseUrl}${endpoint}`, {
      method: options.method || 'GET',
      headers,
      body: options.body ? JSON.stringify(options.body) : undefined,
    });

    if (response.status === 401) {
      // Try to refresh token
      const refreshed = await this.refreshToken();
      if (refreshed) {
        // Retry original request
        headers.Authorization = `Bearer ${this.getToken()}`;
        const retryResponse = await fetch(`${this.baseUrl}${endpoint}`, {
          method: options.method || 'GET',
          headers,
          body: options.body ? JSON.stringify(options.body) : undefined,
        });
        if (!retryResponse.ok) {
          throw new ApiError(retryResponse.status, 'Request failed after token refresh');
        }
        return retryResponse.json();
      }
      // Redirect to login
      if (typeof window !== 'undefined') {
        window.location.href = '/auth';
      }
      throw new ApiError(401, 'Unauthorized');
    }

    if (!response.ok) {
      const error = await response.json().catch(() => ({ message: 'Request failed' }));
      throw new ApiError(response.status, error.message || 'Request failed');
    }

    return response.json();
  }

  private async refreshToken(): Promise<boolean> {
    const refreshToken = localStorage.getItem('refreshToken');
    if (!refreshToken) return false;

    try {
      const response = await fetch(`${this.baseUrl}/auth/refresh`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ refreshToken }),
      });

      if (!response.ok) return false;

      const data = await response.json();
      localStorage.setItem('accessToken', data.data.tokens.accessToken);
      localStorage.setItem('refreshToken', data.data.tokens.refreshToken);
      return true;
    } catch {
      return false;
    }
  }

  // ── Auth ──

  async register(data: { name: string; email: string; password: string; companyName: string }) {
    return this.request<any>('/auth/register', { method: 'POST', body: data });
  }

  async login(data: { email: string; password: string }) {
    return this.request<any>('/auth/login', { method: 'POST', body: data });
  }

  async logout() {
    return this.request<any>('/auth/logout', { method: 'POST' });
  }

  // ── Channels ──

  async getChannels() {
    return this.request<any>('/channels');
  }

  async connectChannel(channelType: string) {
    return this.request<any>('/channels/connect', { method: 'POST', body: { channelType } });
  }

  async disconnectChannel(channelId: string) {
    return this.request<any>(`/channels/${channelId}`, { method: 'DELETE' });
  }

  // ── Conversations ──

  async getConversations(params?: Record<string, any>) {
    const query = params ? '?' + new URLSearchParams(params).toString() : '';
    return this.request<any>(`/conversations${query}`);
  }

  async getConversation(id: string) {
    return this.request<any>(`/conversations/${id}`);
  }

  async sendReply(conversationId: string, content: string) {
    return this.request<any>(`/conversations/${conversationId}/messages`, {
      method: 'POST',
      body: { content },
    });
  }

  async assignConversation(conversationId: string, agentId: string) {
    return this.request<any>(`/conversations/${conversationId}/assign`, {
      method: 'PATCH',
      body: { agentId },
    });
  }

  async updateConversationStatus(conversationId: string, status: string) {
    return this.request<any>(`/conversations/${conversationId}/status`, {
      method: 'PATCH',
      body: { status },
    });
  }

  // ── Leads ──

  async getLeads(params?: Record<string, any>) {
    const query = params ? '?' + new URLSearchParams(params).toString() : '';
    return this.request<any>(`/leads${query}`);
  }

  async getLeadStats() {
    return this.request<any>('/leads/stats');
  }

  async updateLeadTag(leadId: string, tag: string) {
    return this.request<any>(`/leads/${leadId}/tag`, { method: 'PATCH', body: { tag } });
  }

  // ── Analytics ──

  async getAnalyticsOverview() {
    return this.request<any>('/analytics/overview');
  }

  async getLeadFunnel() {
    return this.request<any>('/analytics/lead-funnel');
  }

  async getResponseTimeStats(days?: number) {
    return this.request<any>(`/analytics/response-time${days ? `?days=${days}` : ''}`);
  }

  // ── Settings ──

  async getBrandVoice() {
    return this.request<any>('/settings/brand-voice');
  }

  async updateBrandVoice(data: any) {
    return this.request<any>('/settings/brand-voice', { method: 'PUT', body: data });
  }

  async getTeamMembers() {
    return this.request<any>('/settings/team');
  }

  // ── CRM ──

  async getCrmIntegrations() {
    return this.request<any>('/crm/integrations');
  }

  async getCrmSyncStatus() {
    return this.request<any>('/crm/sync/status');
  }
}

export class ApiError extends Error {
  constructor(public status: number, message: string) {
    super(message);
    this.name = 'ApiError';
  }
}

export const api = new ApiClient(API_BASE);

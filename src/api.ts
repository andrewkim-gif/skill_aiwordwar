/**
 * AWW Agent SDK — REST API Client
 * Agent 등록, 인증, 통계, 국가 조회
 */

import type {
  RegisterRequest,
  RegisterResponse,
  AgentProfile,
  AgentStats,
  MatchResult,
  CountryInfo,
  LeaderboardEntry,
} from './types.js';

const DEFAULT_API_URL = 'https://snake-production-3b4e.up.railway.app';

export class AWWApi {
  private baseUrl: string;
  private apiKey: string | null;

  constructor(apiUrl?: string, apiKey?: string) {
    this.baseUrl = (apiUrl || DEFAULT_API_URL).replace(/\/$/, '');
    this.apiKey = apiKey || null;
  }

  private async request<T>(
    method: string,
    path: string,
    body?: unknown,
  ): Promise<T> {
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
    };
    if (this.apiKey) {
      headers['Authorization'] = `Bearer ${this.apiKey}`;
    }

    const res = await fetch(`${this.baseUrl}${path}`, {
      method,
      headers,
      body: body ? JSON.stringify(body) : undefined,
    });

    if (!res.ok) {
      const text = await res.text().catch(() => 'Unknown error');
      throw new AWWApiError(res.status, text, path);
    }

    return res.json() as Promise<T>;
  }

  // ─── Agent Registration ───

  async register(req: RegisterRequest): Promise<RegisterResponse> {
    const result = await this.request<RegisterResponse>(
      'POST',
      '/api/v1/agents/register',
      req,
    );
    this.apiKey = result.api_key;
    return result;
  }

  async refreshApiKey(): Promise<{ api_key: string }> {
    return this.request('POST', '/api/v1/agents/auth');
  }

  // ─── Agent Profile & Stats ───

  async getProfile(agentId: string): Promise<AgentProfile> {
    return this.request('GET', `/api/v1/agents/${agentId}/profile`);
  }

  async getStats(agentId: string): Promise<AgentStats> {
    return this.request('GET', `/api/v1/agents/${agentId}/stats`);
  }

  async getMatches(
    agentId: string,
    limit = 20,
    offset = 0,
  ): Promise<MatchResult[]> {
    return this.request(
      'GET',
      `/api/v1/agents/${agentId}/matches?limit=${limit}&offset=${offset}`,
    );
  }

  async updateSettings(
    agentId: string,
    settings: { nationality?: string; description?: string },
  ): Promise<void> {
    await this.request('PUT', `/api/v1/agents/${agentId}/settings`, settings);
  }

  // ─── Countries ───

  async getCountries(): Promise<CountryInfo[]> {
    return this.request('GET', '/api/v1/countries');
  }

  async getCountry(iso3: string): Promise<CountryInfo> {
    return this.request('GET', `/api/v1/countries/${iso3}`);
  }

  // ─── Leaderboard ───

  async getLeaderboard(
    sort: 'elo' | 'kills' | 'wins' | 'survival' = 'elo',
    limit = 50,
  ): Promise<LeaderboardEntry[]> {
    return this.request(
      'GET',
      `/api/v1/leaderboard/agents?sort=${sort}&limit=${limit}`,
    );
  }

  // ─── Live Arenas ───

  async getLiveArenas(): Promise<
    Array<{
      arena_id: string;
      country_iso: string;
      mode: string;
      agent_count: number;
      time_remaining: number;
      spectator_url: string;
    }>
  > {
    return this.request('GET', '/api/v1/arenas/live');
  }
}

export class AWWApiError extends Error {
  constructor(
    public status: number,
    public body: string,
    public path: string,
  ) {
    super(`AWW API Error [${status}] ${path}: ${body}`);
    this.name = 'AWWApiError';
  }
}

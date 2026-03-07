/**
 * AWW Agent SDK — Agent Runner
 * 에이전트 생성 → 연결 → 게임 루프를 한 번에 관리
 */

import { GameClient } from './client.js';
import { AWWApi } from './api.js';
import type {
  AWWConfig,
  Strategy,
  AgentState,
  DeathEvent,
  RoundEndEvent,
  CountryInfo,
} from './types.js';
import { AggressiveStrategy } from './strategies/aggressive.js';
import { DefensiveStrategy } from './strategies/defensive.js';
import { BalancedStrategy } from './strategies/balanced.js';

export class AWWAgent {
  private client: GameClient;
  private api: AWWApi;
  private config: AWWConfig;
  private running = false;
  private currentCountry: string | null = null;
  private gamesPlayed = 0;

  constructor(config: AWWConfig) {
    this.config = config;
    this.api = new AWWApi(config.apiUrl, config.apiKey);
    this.client = new GameClient({
      apiKey: config.apiKey,
      serverUrl: config.serverUrl,
      autoReconnect: config.autoReconnect ?? true,
      logLevel: config.logLevel ?? 'info',
    });

    if (config.strategy) {
      this.client.setStrategy(config.strategy);
    }
  }

  // ─── Lifecycle ───

  async start(countryIso?: string): Promise<void> {
    const country = countryIso || this.config.nationality;
    this.currentCountry = country;
    this.running = true;

    this.client.on('connected', () => {
      this.client.joinCountryArena(country);
    });

    this.client.on('roundEnd', (event: RoundEndEvent) => {
      this.gamesPlayed++;
      this.log(`Game #${this.gamesPlayed} complete. ELO: ${event.elo_before}→${event.elo_after}`);

      if (this.running) {
        // 다음 라운드 자동 참가 (3초 대기 후)
        setTimeout(() => {
          if (this.running) {
            this.client.joinCountryArena(country);
          }
        }, 3000);
      }
    });

    this.client.on('death', (_event: DeathEvent) => {
      // 사망 후 다음 라운드 대기 (자동 재참가는 roundEnd에서)
    });

    this.client.on('disconnected', (_code: number, _reason: string) => {
      if (this.running) {
        this.log('Disconnected. Auto-reconnect will retry...');
      }
    });

    this.client.connect();
    this.log(`Agent started. Country: ${country}`);
  }

  stop(): void {
    this.running = false;
    this.client.leaveArena();
    this.client.disconnect();
    this.log(`Agent stopped after ${this.gamesPlayed} games.`);
  }

  // ─── Strategy Selection ───

  useStrategy(strategy: Strategy): this {
    this.client.setStrategy(strategy);
    return this;
  }

  useAggressive(): this {
    return this.useStrategy(new AggressiveStrategy());
  }

  useDefensive(): this {
    return this.useStrategy(new DefensiveStrategy());
  }

  useBalanced(): this {
    return this.useStrategy(new BalancedStrategy());
  }

  // ─── API Helpers ───

  async getCountries(): Promise<CountryInfo[]> {
    return this.api.getCountries();
  }

  async getMyStats(agentId: string) {
    return this.api.getStats(agentId);
  }

  async getLeaderboard() {
    return this.api.getLeaderboard();
  }

  // ─── Event Hooks ───

  onState(handler: (state: AgentState) => void): this {
    this.client.on('state', handler);
    return this;
  }

  onDeath(handler: (event: DeathEvent) => void): this {
    this.client.on('death', handler);
    return this;
  }

  onRoundEnd(handler: (event: RoundEndEvent) => void): this {
    this.client.on('roundEnd', handler);
    return this;
  }

  // ─── Internals ───

  private log(msg: string): void {
    console.log(`[AWW Agent] ${msg}`);
  }
}

// ─── Quick Start Helper ───

export function createAgent(config: AWWConfig): AWWAgent {
  return new AWWAgent(config);
}

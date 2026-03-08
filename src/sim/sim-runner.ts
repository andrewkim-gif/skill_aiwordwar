/**
 * SimRunner — 다중 LLM 에이전트 시뮬레이션 오케스트레이터
 * 여러 LLMNationAgent를 동시에 실행하고, 월드 상태를 관찰/로깅
 */

import { LLMNationAgent } from '../agents/nation-agent.js';
import type { NationAgentConfig } from '../agents/nation-agent.js';
import type { LLMConfig } from '../llm/llm-bridge.js';
import { MetaClient } from '../meta-client.js';
import { SimLogger } from './logger.js';
import type { GDPRanking, WorldCountryStatus } from '../meta-types.js';

export interface SimConfig {
  serverUrl: string;
  agents: SimAgentConfig[];
  durationMinutes: number;
  scenarioName: string;
  logDir: string;
  tickIntervalMs?: number;
  observeIntervalMs?: number;
}

export interface SimAgentConfig {
  name: string;
  countryIso: string;
  apiKey: string;
  llm: LLMConfig;
  personality?: string;
  combatStrategy?: 'aggressive' | 'defensive' | 'balanced';
}

export class SimRunner {
  private agents: LLMNationAgent[] = [];
  private logger: SimLogger;
  private config: SimConfig;
  private observer: MetaClient;
  private observerTimer: ReturnType<typeof setInterval> | null = null;
  private stopTimer: ReturnType<typeof setTimeout> | null = null;
  private running = false;

  constructor(config: SimConfig) {
    this.config = config;
    this.logger = new SimLogger(config.logDir);
    // 관찰용 MetaClient (첫 번째 에이전트 API Key 사용)
    this.observer = new MetaClient({
      serverUrl: config.serverUrl,
      apiKey: config.agents[0]?.apiKey ?? '',
    });
  }

  async start(): Promise<void> {
    this.running = true;

    console.log('╔════════════════════════════════════════════════╗');
    console.log('║     AI World War — Simulation Runner          ║');
    console.log('╚════════════════════════════════════════════════╝');
    console.log(`Scenario: ${this.config.scenarioName}`);
    console.log(`Agents: ${this.config.agents.length}`);
    console.log(`Duration: ${this.config.durationMinutes} minutes`);
    console.log(`Server: ${this.config.serverUrl}`);
    console.log('');

    // 1. 에이전트 순차 초기화 (서버 부하 분산)
    for (const cfg of this.config.agents) {
      const agentConfig: NationAgentConfig = {
        name: cfg.name,
        serverUrl: this.config.serverUrl,
        apiKey: cfg.apiKey,
        countryIso: cfg.countryIso,
        llm: cfg.llm,
        personality: cfg.personality,
        combatStrategy: cfg.combatStrategy,
        strategicTickMs: this.config.tickIntervalMs ?? 30_000,
        onAction: (name, action, result) => this.logger.logAction(name, action, result),
      };

      const agent = new LLMNationAgent(agentConfig);
      this.agents.push(agent);

      console.log(`Starting agent: ${cfg.name} (${cfg.countryIso}) [${cfg.personality ?? 'default'}]`);
      await agent.start();

      // 2초 간격으로 에이전트 시작 (서버 부하 분산)
      await sleep(2000);
    }

    console.log(`\nAll ${this.agents.length} agents started. Simulation running...\n`);

    // 2. 월드 관찰 루프 시작
    const observeInterval = this.config.observeIntervalMs ?? 10_000;
    this.observerTimer = setInterval(() => {
      if (this.running) {
        this.observeWorld().catch(() => {});
      }
    }, observeInterval);

    // 3. 지정 시간 후 자동 종료
    this.stopTimer = setTimeout(() => {
      this.stop().catch(console.error);
    }, this.config.durationMinutes * 60_000);
  }

  async stop(): Promise<void> {
    if (!this.running) return;
    this.running = false;

    console.log('\n⏹️  Stopping simulation...');

    // 타이머 정리
    if (this.observerTimer) clearInterval(this.observerTimer);
    if (this.stopTimer) clearTimeout(this.stopTimer);

    // 에이전트 종료
    for (const agent of this.agents) {
      await agent.stop();
    }

    // 리포트 생성
    const agentNames = this.config.agents.map(a => a.name);
    await this.logger.generateReport(this.config.scenarioName, agentNames);

    console.log('\n✅ Simulation complete.');
  }

  private async observeWorld(): Promise<void> {
    try {
      // /api/v11/world/status returns map[string]*CountryState (not WorldStatus object)
      // /api/v11/gdp/ranking/factions returns { ranking: GDPRanking[], count: number }
      const [countriesMap, rankingRes] = await Promise.all([
        this.observer.get<Record<string, WorldCountryStatus>>('/api/v11/world/status').catch(() => null),
        this.observer.get<{ ranking: GDPRanking[] }>('/api/v11/gdp/ranking/factions').catch(() => null),
      ]);

      // GDP 랭킹 언래핑 — 응답이 {ranking: [...]} 형태
      const ranking = rankingRes?.ranking ?? [];

      // 국가 맵에서 요약 정보 추출
      const countries = countriesMap ? Object.values(countriesMap) : [];
      const totalCountries = countries.length;

      // 전쟁/조약 수는 액션 로그에서 추적 (별도 글로벌 API 없음)
      const warTreatyStats = this.logger.getWarTreatyStats();

      this.logger.logWorldState(ranking, {
        totalCountries,
        activeWars: warTreatyStats.activeWars,
        activeTreaties: warTreatyStats.activeTreaties,
      });
    } catch {
      // 관찰 실패 무시
    }
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

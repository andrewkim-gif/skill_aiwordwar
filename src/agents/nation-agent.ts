/**
 * LLMNationAgent — LLM 기반 국가 운영 에이전트
 * 전략 루프(30초 간격) + 전투 루프(기존 v1) 통합
 */

import { AWWAgent } from '../agent.js';
import { LLMBridge } from '../llm/llm-bridge.js';
import type { LLMConfig } from '../llm/llm-bridge.js';
import { AgentMemory } from '../llm/memory.js';
import type { PastDecision, DiplomaticNote } from '../llm/memory.js';
import { buildStrategicPrompt } from '../llm/prompts.js';
import type { StrategicState } from '../llm/prompts.js';
import { parseActions } from '../llm/action-parser.js';
import type { StrategicAction } from '../llm/action-parser.js';
import { getPersonality } from './personalities.js';
import type {
  TreatyType, MissionType, GDPRanking, WorldEvent, SeasonInfo,
  Faction, FactionDetail, Treaty, War, PolicyState,
} from '../meta-types.js';
import type { CountryInfo } from '../types.js';

export interface NationAgentConfig {
  name: string;
  serverUrl: string;
  apiKey: string;
  countryIso: string;
  llm: LLMConfig;
  personality?: string;
  combatStrategy?: 'aggressive' | 'defensive' | 'balanced';
  strategicTickMs?: number;
  onAction?: (agentName: string, action: string, result: string) => void;
}

export class LLMNationAgent {
  readonly name: string;
  readonly countryIso: string;

  private agent: AWWAgent;
  private llm: LLMBridge;
  private memory: AgentMemory;
  private personality: string;
  private tickInterval: number;
  private tickTimer: ReturnType<typeof setInterval> | null = null;
  private tickNumber = 0;
  private running = false;
  private myFactionId: string | null = null;
  private lastIntelTick = 0; // 마지막 인텔 성공 틱 (1시간 쿨다운 추적)
  private gdpHistory: number[] = []; // GDP 변화 추적 (최근 N틱)
  private recentActionTypes: string[] = []; // 전략 다양화 추적 (최근 10개)
  private onAction?: (agentName: string, action: string, result: string) => void;

  constructor(config: NationAgentConfig) {
    this.name = config.name;
    this.countryIso = config.countryIso;
    this.tickInterval = config.strategicTickMs ?? 30_000;
    this.personality = getPersonality(config.personality);
    this.onAction = config.onAction;

    this.agent = new AWWAgent({
      apiKey: config.apiKey,
      serverUrl: config.serverUrl,
      nationality: config.countryIso,
      logLevel: 'warn',
    });

    // 전투 전략 설정
    switch (config.combatStrategy) {
      case 'aggressive': this.agent.useAggressive(); break;
      case 'defensive': this.agent.useDefensive(); break;
      default: this.agent.useBalanced(); break;
    }

    this.llm = new LLMBridge(config.llm);
    this.memory = new AgentMemory(50);
  }

  async start(): Promise<void> {
    this.running = true;
    this.log('Starting...');

    // 전투 루프 시작 (기존 v1 — WebSocket 전투)
    await this.agent.start(this.countryIso);

    // 초기 전략 틱 (3초 대기 후 — 서버 접속 안정화)
    setTimeout(() => {
      if (this.running) {
        this.strategicTick().catch(err => this.log(`Initial tick error: ${err.message}`));
      }
    }, 3000);

    // 주기적 전략 틱
    this.tickTimer = setInterval(() => {
      if (this.running) {
        this.strategicTick().catch(err => this.log(`Tick error: ${err.message}`));
      }
    }, this.tickInterval);

    this.log(`Strategic loop started (every ${this.tickInterval / 1000}s)`);
  }

  async stop(): Promise<void> {
    this.running = false;
    if (this.tickTimer) {
      clearInterval(this.tickTimer);
      this.tickTimer = null;
    }
    this.agent.stop();
    this.log(`Stopped after ${this.tickNumber} ticks`);
  }

  getMemory(): AgentMemory {
    return this.memory;
  }

  getTickNumber(): number {
    return this.tickNumber;
  }

  // ─── 전략 루프 ───

  private async strategicTick(): Promise<void> {
    this.tickNumber++;
    this.log(`Tick #${this.tickNumber} — gathering state...`);

    // 전략 목표 자동 설정 (매 틱 갱신)
    this.memory.setGoals(['Grow GDP', 'Diversify actions', 'Maintain alliances']);

    try {
      // 1. 상태 수집
      const state = await this.gatherState();

      // 2. LLM에 전략 질의
      const prompt = buildStrategicPrompt(state);
      const response = await this.llm.query(this.personality, prompt);

      // 3. 액션 파싱
      const actions = parseActions(response);
      this.log(`Tick #${this.tickNumber} — ${actions.length} actions decided`);

      // 4. 액션 실행
      await this.executeActions(actions);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      this.log(`Tick #${this.tickNumber} error: ${msg}`);
    }
  }

  // 팩션 자동 생성/조회 — 첫 틱에서 팩션이 없으면 생성
  private async ensureFaction(): Promise<void> {
    if (this.myFactionId) return;

    // 이미 존재하는 내 팩션 찾기 (내 이름과 매칭되는 팩션)
    const factions = await this.agent.faction.list().catch((): Faction[] => []);
    const existing = factions.find(f => f.name === this.name || f.tag === this.countryIso);
    if (existing) {
      this.myFactionId = existing.id;
      // 기존 팩션에 JOIN하여 현재 userID를 멤버로 등록
      try {
        await this.agent.faction.join(existing.id);
        this.log(`Joined existing faction: ${existing.name} [${existing.tag}] (${existing.id})`);
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        // "already belongs to a faction" = 이미 멤버 → 정상
        if (msg.includes('already belongs')) {
          this.log(`Already member of faction: ${existing.name} [${existing.tag}]`);
        } else {
          this.log(`Join faction note: ${msg}`);
        }
      }
    } else {
      // 팩션 생성 (creator는 자동으로 멤버 등록됨)
      try {
        const faction = await this.agent.faction.create(this.name, this.countryIso);
        this.myFactionId = faction.id;
        this.log(`Created faction: ${faction.name} [${faction.tag}] (${faction.id})`);
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        // 이름 충돌 시 기존 팩션 찾아서 JOIN
        if (msg.includes('already') || msg.includes('exists')) {
          const retry = factions.find(f => f.name === this.name || f.tag === this.countryIso);
          if (retry) {
            this.myFactionId = retry.id;
            try {
              await this.agent.faction.join(retry.id);
              this.log(`Joined faction after create conflict: ${retry.name} (${retry.id})`);
            } catch (joinErr) {
              const joinMsg = joinErr instanceof Error ? joinErr.message : String(joinErr);
              if (joinMsg.includes('already belongs')) {
                this.log(`Already member of faction: ${retry.name}`);
              } else {
                this.log(`Failed to join faction: ${joinMsg}`);
              }
            }
          } else {
            this.log(`Failed to create faction: ${msg}`);
            return;
          }
        } else {
          this.log(`Failed to create faction: ${msg}`);
          return;
        }
      }
    }

    // 자국 소유권 자동 부여 (sovereignty Lv.3 — 정책 변경 최소 조건)
    try {
      const result = await this.agent.world.claimCountry(this.countryIso);
      this.log(`Claimed sovereignty: ${result.country_iso} (Lv.${result.sovereignty_level}) — ${result.status}`);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      // 이미 소유 중이면 무시
      if (!msg.includes('already claimed')) {
        this.log(`Sovereignty claim note: ${msg}`);
      }
    }
  }

  private async gatherState(): Promise<StrategicState> {
    // 팩션 자동 생성/조회
    await this.ensureFaction();

    // 병렬로 상태 수집 (5~8 API 호출)
    const [
      worldStatus,
      countries,
      factionList,
      ranking,
      events,
      season,
    ] = await Promise.all([
      this.agent.world.getWorldStatus().catch(() => null),
      this.agent.world.getCountries().catch((): CountryInfo[] => []),
      this.agent.faction.list().catch((): Faction[] => []),
      this.agent.economy.getCountryRanking().catch((): GDPRanking[] => []),
      this.agent.world.getActiveEvents().catch((): WorldEvent[] => []),
      this.agent.world.getSeasonInfo().catch((): SeasonInfo | null => null),
    ]);

    // 내 팩션 찾기 (캐시된 ID 또는 이름 매칭)
    const myFaction = this.myFactionId
      ? factionList.find(f => f.id === this.myFactionId) ?? factionList.find(f => f.name === this.name)
      : factionList.find(f => f.name === this.name);
    let factionDetail = null;
    let treaties: Treaty[] = [];
    let wars: War[] = [];
    let policy: PolicyState | null = null;

    let research: any = null;
    let pendingTreaties: Treaty[] = [];
    if (myFaction) {
      [factionDetail, treaties, wars, research, pendingTreaties] = await Promise.all([
        this.agent.faction.get(myFaction.id).catch((): FactionDetail | null => null),
        this.agent.diplomacy.getActiveTreaties(myFaction.id).catch((): Treaty[] => []),
        this.agent.war.getActiveWars(myFaction.id).catch((): War[] => []),
        this.agent.economy.getResearch(myFaction.id).catch(() => null),
        this.agent.diplomacy.getPendingProposals(myFaction.id).catch((): Treaty[] => []),
      ]);
    }

    policy = await this.agent.economy.getPolicy(this.countryIso).catch(() => null);

    // 내 국가 목록
    const statusObj = worldStatus as any;
    const countryList = Array.isArray(statusObj) ? statusObj :
      (statusObj && typeof statusObj === 'object' ? Object.values(statusObj) : []) as CountryInfo[];
    const myCountries = factionDetail?.countries
      ? countryList.filter((c: any) => factionDetail.countries.includes(c.iso3))
      : [];

    // GDP 순위에서 내 위치 찾기 (ranking이 배열인지 확인)
    const rankingArr = Array.isArray(ranking) ? ranking : [];
    const myGdpEntry = rankingArr.find(r => r.id === myFaction?.id);
    const myGdpRank = myGdpEntry ? rankingArr.indexOf(myGdpEntry) + 1 : rankingArr.length;

    // 인텔 쿨다운: 1시간(120틱@30s) — 최근 인텔 성공 후 경과 틱 확인
    const intelCooldownTicks = 120; // 60min / 0.5min = 120 ticks
    const intelOnCooldown = (this.tickNumber - this.lastIntelTick) < intelCooldownTicks && this.lastIntelTick > 0;

    // GDP 변화 추적 (최근 5틱)
    const currentGdp = myGdpEntry?.gdp ?? 0;
    this.gdpHistory.push(currentGdp);
    if (this.gdpHistory.length > 6) this.gdpHistory.shift(); // 5틱 비교 위해 6개 유지

    let gdpGrowth: string | undefined;
    if (this.gdpHistory.length >= 2) {
      const prev = this.gdpHistory[0];
      const curr = this.gdpHistory[this.gdpHistory.length - 1];
      if (prev > 0) {
        const growthPct = ((curr - prev) / prev) * 100;
        gdpGrowth = `${growthPct >= 0 ? '+' : ''}${growthPct.toFixed(1)}% over last ${this.gdpHistory.length - 1} ticks`;
      }
    }

    // 전략 다양화 경고
    let strategyWarning: string | undefined;
    if (this.recentActionTypes.length >= 3) {
      const last3 = this.recentActionTypes.slice(-3);
      if (last3[0] === last3[1] && last3[1] === last3[2]) {
        strategyWarning = `You have used "${last3[0]}" 3+ times in a row. Diversify your strategy!`;
      }
    }

    // 기술 투자 진행률 추출
    let techProgress: Record<string, { invested: number; required: number }> | undefined;
    if (research?.node_progress && typeof research.node_progress === 'object') {
      techProgress = {};
      for (const [nodeId, progress] of Object.entries(research.node_progress)) {
        const p = progress as any;
        if (p && typeof p === 'object' && !p.is_completed) {
          techProgress[nodeId] = {
            invested: p.invested ?? p.current ?? 0,
            required: p.required ?? p.cost ?? 0,
          };
        }
      }
      if (Object.keys(techProgress).length === 0) techProgress = undefined;
    }

    return {
      myFaction: factionDetail ?? {
        id: 'unknown',
        name: this.name,
        tag: '???',
        leader_id: '',
        member_count: 1,
        prestige: 0,
        created_at: '',
        members: [],
        treasury: {},
        countries: [this.countryIso],
      },
      myFactionId: this.myFactionId ?? 'unknown',
      myCountryIso: this.countryIso,
      myCountries,
      myEconomy: {
        gdp: myGdpEntry?.gdp ?? 0,
        gdpRank: myGdpRank,
        policies: policy?.policies ?? { tax_rate: 10, trade_openness: 50, military_spend: 15, tech_invest: 10 },
      },
      treaties,
      activeWars: wars,
      worldRanking: rankingArr,
      recentEvents: events,
      season: season ?? {
        id: '0', number: 0, name: 'Unknown', current_era: 'discovery' as const,
        started_at: '', ends_at: '', progress: 0,
      },
      memoryContext: this.memory.toPromptContext(),
      tickNumber: this.tickNumber,
      completedTech: this.extractCompletedTech(research),
      pendingTreaties,
      allFactions: factionList,
      intelOnCooldown,
      gdpGrowth,
      strategyWarning,
      techProgress,
    };
  }

  private extractCompletedTech(research: any): string[] {
    if (!research) return [];
    // API returns: { completed_ids: ["eco_1", ...], node_progress: {...} }
    if (Array.isArray(research.completed_ids)) return research.completed_ids;
    // Fallback: check node_progress
    if (research.node_progress && typeof research.node_progress === 'object') {
      return Object.entries(research.node_progress)
        .filter(([, v]: [string, any]) => v?.is_completed)
        .map(([k]) => k);
    }
    return [];
  }

  private async executeActions(actions: StrategicAction[]): Promise<void> {
    for (const action of actions) {
      const p = action.params;
      let result = 'success';

      try {
        switch (action.action) {
          case 'set_policy': {
            // LLM은 정수(15=15%)로 보내지만 서버는 소수(0.15)를 기대
            const toRatio = (v: unknown): number => {
              const n = Number(v) || 0;
              return n > 1 ? n / 100 : n; // 15 → 0.15, 0.15 → 0.15
            };
            await this.agent.economy.setAllPolicies(this.countryIso, {
              tax_rate: toRatio(p.tax_rate),
              trade_openness: toRatio(p.trade_openness),
              military_spend: toRatio(p.military_spend),
              tech_invest: toRatio(p.tech_invest),
            });
            break;
          }
          case 'propose_treaty': {
            const target = p.target as string;
            // 자기 자신에게 조약 제안 방지
            if (target === this.myFactionId) {
              result = 'skipped: cannot propose treaty to yourself';
              break;
            }
            await this.agent.diplomacy.proposeTreaty(target, p.type as TreatyType);
            break;
          }
          case 'accept_treaty':
            await this.agent.diplomacy.acceptTreaty(p.treatyId as string);
            break;
          case 'reject_treaty':
            await this.agent.diplomacy.rejectTreaty(p.treatyId as string);
            break;
          case 'break_treaty':
            await this.agent.diplomacy.breakTreaty(p.treatyId as string);
            break;
          case 'declare_war':
            await this.agent.war.declareWar(p.target as string);
            break;
          case 'surrender':
            await this.agent.war.surrender(p.warId as string);
            break;
          case 'propose_ceasefire':
            await this.agent.war.proposeCeasefire(p.warId as string);
            break;
          case 'place_trade_order':
            await this.agent.economy.placeOrder({
              resource: p.resource as string,
              side: p.side as 'buy' | 'sell',
              quantity: p.quantity as number,
              price: p.price as number,
            });
            break;
          case 'invest_tech':
            await this.agent.economy.investTech(p.node as string, p.amount as number);
            break;
          case 'launch_intel':
            await this.agent.intel.launchMission(p.type as MissionType, p.target as string);
            this.lastIntelTick = this.tickNumber; // 쿨다운 추적
            break;
          case 'do_nothing':
            break;
          default:
            result = `unknown action: ${action.action}`;
        }
      } catch (err) {
        result = `failed: ${err instanceof Error ? err.message : String(err)}`;
      }

      // 결과 기록
      const decision: PastDecision = {
        tick: this.tickNumber,
        timestamp: Date.now(),
        action: action.action,
        params: p,
        result,
      };
      this.memory.log(decision);

      // 외교 관련 액션 결과 → 메모리에 관계 기록
      if (result === 'success') {
        this.wireDiplomaticMemory(action.action, p);
      }

      // 전략 다양화 추적 (최근 10개)
      this.recentActionTypes.push(action.action);
      if (this.recentActionTypes.length > 10) this.recentActionTypes.shift();

      // 콜백 (SimRunner 로깅용)
      this.onAction?.(this.name, `${action.action}(${JSON.stringify(p)})`, result);

      this.log(`  → ${action.action}: ${result}`);
    }
  }

  /**
   * 외교 액션 성공 시 AgentMemory에 관계 기록
   */
  private wireDiplomaticMemory(action: string, params: Record<string, unknown>): void {
    const now = Date.now();
    switch (action) {
      case 'propose_treaty': {
        const targetId = params.target as string;
        const treatyType = params.type as string;
        const note: DiplomaticNote = {
          factionId: targetId,
          factionName: targetId.slice(0, 8),
          relation: 'ally',
          note: `proposed ${treatyType}`,
          updatedAt: now,
        };
        this.memory.setRelation(targetId, note);
        break;
      }
      case 'accept_treaty': {
        // accept_treaty에서는 proposer 정보가 params에 직접 없으므로 treatyId 기반 추적
        const treatyId = params.treatyId as string;
        const note: DiplomaticNote = {
          factionId: treatyId,
          factionName: treatyId.slice(0, 8),
          relation: 'ally',
          note: 'accepted treaty',
          updatedAt: now,
        };
        this.memory.setRelation(treatyId, note);
        break;
      }
      case 'reject_treaty': {
        const treatyId = params.treatyId as string;
        const note: DiplomaticNote = {
          factionId: treatyId,
          factionName: treatyId.slice(0, 8),
          relation: 'rival',
          note: 'rejected treaty',
          updatedAt: now,
        };
        this.memory.setRelation(treatyId, note);
        break;
      }
      case 'declare_war': {
        const targetId = params.target as string;
        const note: DiplomaticNote = {
          factionId: targetId,
          factionName: targetId.slice(0, 8),
          relation: 'enemy',
          note: 'declared war',
          updatedAt: now,
        };
        this.memory.setRelation(targetId, note);
        break;
      }
    }
  }

  private log(msg: string): void {
    console.log(`[${this.name}] ${msg}`);
  }
}

/**
 * AWW Agent SDK — MatrixGameClient
 * v33 Online Matrix 전용 WebSocket 클라이언트.
 *
 * 기존 GameClient({angle, boost})와 별개:
 *  - 입력: {x, y, angle, boost, tick} (위치 보고)
 *  - 킬: matrix_kill 클라이언트 리포팅 + 서버 검증
 *  - 상태: matrix_agent_state 수신 (HP, 레벨, 무기, 주변 적, 좌표)
 *  - 에폭: matrix_epoch 페이즈 전환 인식
 *
 * Wire format: {e: string, d: any} JSON (기존과 동일)
 */

import WebSocket from 'ws';
import type {
  MatrixStrategy,
  MatrixAgentState,
  MatrixAgentInput,
  MatrixKillReport,
  MatrixKillConfirmed,
  MatrixKillRejected,
  MatrixEpochEvent,
  MatrixResultEvent,
  MatrixJoinResult,
  MatrixTokenBuffs,
  MatrixEpochPhase,
  UpgradeChoice,
  WireFrame,
} from './types.js';

const DEFAULT_WS_URL = 'wss://snake-production-3b4e.up.railway.app';

export type MatrixLogLevel = 'debug' | 'info' | 'warn' | 'error';

const LOG_PRIORITY: Record<MatrixLogLevel, number> = {
  debug: 0,
  info: 1,
  warn: 2,
  error: 3,
};

// ─── Options & Events ───

export interface MatrixGameClientOptions {
  apiKey: string;
  serverUrl?: string;
  autoReconnect?: boolean;
  logLevel?: MatrixLogLevel;
  /** 에이전트 배치 비용 Oil — 서버가 차감 검증 */
  deploymentCostOil?: number;
}

export interface MatrixGameClientEvents {
  connected: () => void;
  disconnected: (code: number, reason: string) => void;
  error: (err: Error) => void;
  joined: (result: MatrixJoinResult) => void;
  state: (state: MatrixAgentState) => void;
  epochChange: (event: MatrixEpochEvent) => void;
  killConfirmed: (event: MatrixKillConfirmed) => void;
  killRejected: (event: MatrixKillRejected) => void;
  result: (event: MatrixResultEvent) => void;
  levelUp: (choices: UpgradeChoice[]) => void;
  buffs: (buffs: MatrixTokenBuffs) => void;
  spawnSeed: (data: { seed: string; waveId: number; tick: number }) => void;
}

type EventHandler<K extends keyof MatrixGameClientEvents> = MatrixGameClientEvents[K];

// ─── MatrixGameClient ───

export class MatrixGameClient {
  private ws: WebSocket | null = null;
  private apiKey: string;
  private serverUrl: string;
  private autoReconnect: boolean;
  private logLevel: MatrixLogLevel;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private handlers = new Map<string, Set<Function>>();
  private strategy: MatrixStrategy | null = null;
  private inputInterval: ReturnType<typeof setInterval> | null = null;
  private lastState: MatrixAgentState | null = null;
  private connected = false;
  private currentPhase: MatrixEpochPhase = 'peace';
  private currentCountry: string | null = null;

  constructor(options: MatrixGameClientOptions) {
    this.apiKey = options.apiKey;
    this.serverUrl = (options.serverUrl || DEFAULT_WS_URL).replace(/\/$/, '');
    this.autoReconnect = options.autoReconnect ?? true;
    this.logLevel = options.logLevel ?? 'info';
  }

  // ─── Event Handling ───

  on<K extends keyof MatrixGameClientEvents>(
    event: K,
    handler: EventHandler<K>,
  ): this {
    if (!this.handlers.has(event)) this.handlers.set(event, new Set());
    this.handlers.get(event)!.add(handler);
    return this;
  }

  off<K extends keyof MatrixGameClientEvents>(
    event: K,
    handler: EventHandler<K>,
  ): this {
    this.handlers.get(event)?.delete(handler);
    return this;
  }

  private emit<K extends keyof MatrixGameClientEvents>(
    event: K,
    ...args: Parameters<MatrixGameClientEvents[K]>
  ): void {
    this.handlers.get(event)?.forEach((fn) => {
      try {
        (fn as Function)(...args);
      } catch (err) {
        this.log('error', `Handler error [${event}]:`, err);
      }
    });
  }

  // ─── Strategy ───

  setStrategy(strategy: MatrixStrategy): this {
    this.strategy = strategy;
    this.log('info', `Matrix strategy set: ${strategy.name}`);
    return this;
  }

  // ─── Connection ───

  connect(): void {
    if (this.ws) this.disconnect();

    const url = `${this.serverUrl}/ws?api_key=${this.apiKey}`;
    this.log('info', `Connecting to ${this.serverUrl} (Matrix mode)...`);

    this.ws = new WebSocket(url);

    this.ws.on('open', () => {
      this.connected = true;
      this.log('info', 'Connected to AWW server (Matrix)');
      this.emit('connected');
    });

    this.ws.on('message', (data) => {
      const raw = data.toString();
      const parts = raw.split('\n');
      for (const part of parts) {
        const trimmed = part.trim();
        if (!trimmed) continue;
        try {
          const frame = JSON.parse(trimmed) as WireFrame;
          this.handleMessage(frame);
        } catch (err) {
          this.log('error', 'Failed to parse message:', err);
        }
      }
    });

    this.ws.on('close', (code, reason) => {
      this.connected = false;
      this.stopInputLoop();
      const reasonStr = reason?.toString() || 'unknown';
      this.log('warn', `Disconnected: ${code} ${reasonStr}`);
      this.emit('disconnected', code, reasonStr);

      if (this.autoReconnect && code !== 1000) {
        this.log('info', 'Reconnecting in 3s...');
        this.reconnectTimer = setTimeout(() => this.connect(), 3000);
      }
    });

    this.ws.on('error', (err) => {
      this.log('error', 'WebSocket error:', err.message);
      this.emit('error', err);
    });
  }

  disconnect(): void {
    this.autoReconnect = false;
    if (this.reconnectTimer) clearTimeout(this.reconnectTimer);
    this.stopInputLoop();
    if (this.ws) {
      this.ws.close(1000, 'Client disconnect');
      this.ws = null;
    }
    this.connected = false;
    this.currentCountry = null;
  }

  isConnected(): boolean {
    return this.connected;
  }

  getCurrentPhase(): MatrixEpochPhase {
    return this.currentPhase;
  }

  getCurrentCountry(): string | null {
    return this.currentCountry;
  }

  getLastState(): MatrixAgentState | null {
    return this.lastState;
  }

  // ─── Game Actions ───

  /** Matrix 아레나 입장 (isAgent=true 자동 설정) */
  joinMatrixArena(countryCode: string, build?: string): void {
    this.currentCountry = countryCode;
    this.send('matrix_join', {
      countryCode,
      build: build ?? undefined,
      isAgent: true,
    });
    this.log('info', `Joining Matrix arena: ${countryCode}`);
  }

  /** Matrix 아레나 퇴장 */
  leaveMatrixArena(): void {
    this.stopInputLoop();
    this.send('matrix_leave', {});
    this.currentCountry = null;
    this.log('info', 'Left Matrix arena');
  }

  /** Matrix 입력 전송 (10Hz) */
  sendMatrixInput(input: MatrixAgentInput): void {
    this.send('matrix_agent_input', input);
  }

  /** 킬 리포트 전송 (서버 검증) */
  reportKill(report: MatrixKillReport): void {
    this.send('matrix_kill', report);
    this.log('debug', `Kill reported: target=${report.targetId}, weapon=${report.weaponId}`);
  }

  /** 레벨업 선택 */
  chooseLevelUp(choiceId: string): void {
    this.send('matrix_level_up', { choiceId });
    this.log('debug', `Level-up choice: ${choiceId}`);
  }

  /** 캡처 포인트 진입 */
  capturePoint(pointId: string): void {
    this.send('matrix_capture', { pointId });
  }

  // ─── Message Handling ───

  private handleMessage(frame: WireFrame): void {
    switch (frame.e) {
      case 'agent_welcome':
        this.log('info', `Welcome (Matrix)! Agent: ${(frame.d as any).agent_id}`);
        break;

      case 'matrix_joined': {
        const result = frame.d as unknown as MatrixJoinResult;
        if (result.success) {
          this.currentPhase = result.phase;
          this.emit('joined', result);
          this.startInputLoop();
          this.log('info', `Joined Matrix arena: ${result.countryCode}, phase=${result.phase}`);
        } else {
          this.log('error', `Failed to join Matrix arena: ${result.error}`);
          this.emit('joined', result);
        }
        break;
      }

      case 'matrix_agent_state': {
        const state = frame.d as unknown as MatrixAgentState;
        this.lastState = state;
        this.currentPhase = state.phase;
        this.emit('state', state);

        // 전쟁 페이즈에서 킬 기회 탐색
        if (this.strategy?.onKillOpportunity && state.phase === 'war') {
          for (const enemy of state.nearby_enemies) {
            const killReport = this.strategy.onKillOpportunity(state, enemy);
            if (killReport) {
              this.reportKill(killReport);
              break; // 틱당 1킬만
            }
          }
        }
        break;
      }

      case 'matrix_epoch': {
        const event = frame.d as unknown as MatrixEpochEvent;
        this.currentPhase = event.phase;
        this.emit('epochChange', event);
        this.log('info', `Epoch phase: ${event.phase}, pvp=${event.config.pvpEnabled}`);
        break;
      }

      case 'matrix_kill_confirmed': {
        const event = frame.d as unknown as MatrixKillConfirmed;
        this.emit('killConfirmed', event);
        this.log('debug', `Kill confirmed: target=${event.targetId}, score=${event.score}`);
        break;
      }

      case 'matrix_kill_rejected': {
        const event = frame.d as unknown as MatrixKillRejected;
        this.emit('killRejected', event);
        this.log('warn', `Kill rejected: ${event.reason}`);
        break;
      }

      case 'matrix_result': {
        const event = frame.d as unknown as MatrixResultEvent;
        this.emit('result', event);
        this.strategy?.onEpochEnd?.(event);
        this.log('info', `Epoch result: ${event.rankings.length} nations, ${event.rewards.length} rewards`);
        break;
      }

      case 'matrix_level_up_choices': {
        const data = frame.d as any;
        const choices: UpgradeChoice[] = data.choices ?? [];
        this.emit('levelUp', choices);

        // 전략에 위임
        if (this.strategy && this.lastState && choices.length > 0) {
          const choice = this.strategy.onLevelUp(this.lastState, choices);
          this.chooseLevelUp(choice);
        }
        break;
      }

      case 'matrix_buff': {
        const buffs = frame.d as unknown as MatrixTokenBuffs;
        this.emit('buffs', buffs);
        this.log('debug', `Buffs: tier=${buffs.tier}, xp=${buffs.xpBoost}%, stat=${buffs.statBoost}%`);
        break;
      }

      case 'matrix_spawn_seed': {
        const data = frame.d as any;
        this.emit('spawnSeed', {
          seed: data.seed,
          waveId: data.waveId,
          tick: data.tick,
        });
        break;
      }

      default:
        this.log('debug', `Unknown Matrix event: ${frame.e}`);
    }
  }

  // ─── Input Loop (10Hz, 에폭 페이즈별 전략 분기) ───

  private startInputLoop(): void {
    this.stopInputLoop();

    // 100ms 간격 = 10Hz
    this.inputInterval = setInterval(() => {
      if (!this.lastState || !this.strategy) return;
      if (!this.lastState.self.alive) return;

      let input: MatrixAgentInput;
      switch (this.currentPhase) {
        case 'peace':
          input = this.strategy.onPeace(this.lastState);
          break;
        case 'war':
        case 'war_countdown':
          input = this.strategy.onWar(this.lastState);
          break;
        case 'shrink':
          input = this.strategy.onShrink(this.lastState);
          break;
        default:
          // end, transition — 입력 스킵
          return;
      }

      this.sendMatrixInput(input);
    }, 100);
  }

  private stopInputLoop(): void {
    if (this.inputInterval) {
      clearInterval(this.inputInterval);
      this.inputInterval = null;
    }
  }

  // ─── Wire Protocol ───

  private send(event: string, data: unknown): void {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) return;
    const frame: WireFrame = { e: event, d: data };
    this.ws.send(JSON.stringify(frame));
  }

  // ─── Logging ───

  private log(level: MatrixLogLevel, ...args: unknown[]): void {
    if (LOG_PRIORITY[level] < LOG_PRIORITY[this.logLevel]) return;
    const prefix = `[AWW:Matrix:${level.toUpperCase()}]`;
    switch (level) {
      case 'error': console.error(prefix, ...args); break;
      case 'warn': console.warn(prefix, ...args); break;
      default: console.log(prefix, ...args);
    }
  }
}

/**
 * AWW Agent SDK — WebSocket Game Client
 * 실시간 게임 연결, 상태 수신, 입력 전송
 */

import WebSocket from 'ws';
import type {
  AgentState,
  AgentInput,
  LevelUpEvent,
  DeathEvent,
  RoundEndEvent,
  WireFrame,
  Strategy,
} from './types.js';

const DEFAULT_WS_URL = 'wss://snake-production-3b4e.up.railway.app';

export type LogLevel = 'debug' | 'info' | 'warn' | 'error';

const LOG_PRIORITY: Record<LogLevel, number> = {
  debug: 0,
  info: 1,
  warn: 2,
  error: 3,
};

export interface GameClientOptions {
  apiKey: string;
  serverUrl?: string;
  autoReconnect?: boolean;
  logLevel?: LogLevel;
}

export interface GameClientEvents {
  connected: () => void;
  disconnected: (code: number, reason: string) => void;
  error: (err: Error) => void;
  state: (state: AgentState) => void;
  levelUp: (event: LevelUpEvent) => void;
  death: (event: DeathEvent) => void;
  roundEnd: (event: RoundEndEvent) => void;
  joined: (data: { arena_id: string; spawn: { x: number; y: number } }) => void;
}

type EventHandler<K extends keyof GameClientEvents> = GameClientEvents[K];

export class GameClient {
  private ws: WebSocket | null = null;
  private apiKey: string;
  private serverUrl: string;
  private autoReconnect: boolean;
  private logLevel: LogLevel;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private handlers = new Map<string, Set<Function>>();
  private strategy: Strategy | null = null;
  private inputInterval: ReturnType<typeof setInterval> | null = null;
  private lastInput: AgentInput = { angle: 0, boost: false };
  private lastState: AgentState | null = null;
  private connected = false;

  constructor(options: GameClientOptions) {
    this.apiKey = options.apiKey;
    this.serverUrl = (options.serverUrl || DEFAULT_WS_URL).replace(/\/$/, '');
    this.autoReconnect = options.autoReconnect ?? true;
    this.logLevel = options.logLevel ?? 'info';
  }

  // ─── Event Handling ───

  on<K extends keyof GameClientEvents>(
    event: K,
    handler: EventHandler<K>,
  ): this {
    if (!this.handlers.has(event)) this.handlers.set(event, new Set());
    this.handlers.get(event)!.add(handler);
    return this;
  }

  off<K extends keyof GameClientEvents>(
    event: K,
    handler: EventHandler<K>,
  ): this {
    this.handlers.get(event)?.delete(handler);
    return this;
  }

  private emit<K extends keyof GameClientEvents>(
    event: K,
    ...args: Parameters<GameClientEvents[K]>
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

  setStrategy(strategy: Strategy): this {
    this.strategy = strategy;
    this.log('info', `Strategy set: ${strategy.name}`);
    return this;
  }

  // ─── Connection ───

  connect(): void {
    if (this.ws) this.disconnect();

    const url = `${this.serverUrl}/ws/agent?api_key=${this.apiKey}`;
    this.log('info', `Connecting to ${this.serverUrl}...`);

    this.ws = new WebSocket(url);

    this.ws.on('open', () => {
      this.connected = true;
      this.log('info', 'Connected to AWW server');
      this.emit('connected');
    });

    this.ws.on('message', (data) => {
      try {
        const frame = JSON.parse(data.toString()) as WireFrame;
        this.handleMessage(frame);
      } catch (err) {
        this.log('error', 'Failed to parse message:', err);
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
  }

  isConnected(): boolean {
    return this.connected;
  }

  // ─── Game Actions ───

  joinCountryArena(countryIso: string): void {
    this.send('join_country_arena', { country: countryIso });
    this.log('info', `Joining arena: ${countryIso}`);
  }

  sendInput(input: AgentInput): void {
    this.lastInput = input;
    this.send('agent_input', input);
  }

  chooseUpgrade(choiceId: string): void {
    this.send('choose_upgrade', { choice_id: choiceId });
    this.log('debug', `Upgrade chosen: ${choiceId}`);
  }

  leaveArena(): void {
    this.stopInputLoop();
    this.send('leave_room', {});
    this.log('info', 'Left arena');
  }

  // ─── Message Handling ───

  private handleMessage(frame: WireFrame): void {
    switch (frame.e) {
      case 'agent_welcome':
        this.log('info', `Welcome! Agent: ${(frame.d as any).agent_id}, ELO: ${(frame.d as any).elo}`);
        break;

      case 'joined':
        this.emit('joined', frame.d as any);
        this.startInputLoop();
        this.log('info', `Joined arena: ${(frame.d as any).arena_id}`);
        break;

      case 'agent_state':
        this.lastState = frame.d as unknown as AgentState;
        this.emit('state', this.lastState);
        break;

      case 'level_up': {
        const levelUp = frame.d as unknown as LevelUpEvent;
        this.emit('levelUp', levelUp);
        if (this.strategy && this.lastState) {
          const choice = this.strategy.onLevelUp(this.lastState, levelUp.choices);
          this.chooseUpgrade(choice);
        }
        break;
      }

      case 'agent_death': {
        const death = frame.d as unknown as DeathEvent;
        this.emit('death', death);
        this.stopInputLoop();
        this.strategy?.onDeath?.(death);
        this.log('info', `Died. Score: ${death.score}, Rank: ${death.rank}`);
        break;
      }

      case 'round_end': {
        const roundEnd = frame.d as unknown as RoundEndEvent;
        this.emit('roundEnd', roundEnd);
        this.stopInputLoop();
        this.strategy?.onRoundEnd?.(roundEnd);
        this.log('info', `Round ended. Rank: ${roundEnd.final_rank}, ELO: ${roundEnd.elo_before}→${roundEnd.elo_after}`);
        break;
      }

      default:
        this.log('debug', `Unknown event: ${frame.e}`);
    }
  }

  // ─── Input Loop (≤10Hz, heading 유지) ───

  private startInputLoop(): void {
    this.stopInputLoop();
    // 100ms 간격 = 10Hz (서버 제한에 맞춤)
    this.inputInterval = setInterval(() => {
      if (!this.lastState || !this.strategy) return;
      if (!this.lastState.self.alive) return;

      const input = this.strategy.onGameState(this.lastState);
      this.sendInput(input);
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

  private log(level: LogLevel, ...args: unknown[]): void {
    if (LOG_PRIORITY[level] < LOG_PRIORITY[this.logLevel]) return;
    const prefix = `[AWW:${level.toUpperCase()}]`;
    switch (level) {
      case 'error': console.error(prefix, ...args); break;
      case 'warn': console.warn(prefix, ...args); break;
      default: console.log(prefix, ...args);
    }
  }
}

/**
 * AWW Agent SDK — Type Definitions
 * v15 Agent Arena API 프로토콜 기반
 */

// ─── Agent Profile ───

export interface AgentProfile {
  id: string;
  name: string;
  description: string;
  nationality: string;
  avatar_url?: string;
  owner_wallet?: string;
  elo: number;
  games_played: number;
  wins: number;
  kills: number;
  deaths: number;
  avg_survival_time: number;
  avg_score: number;
  preferred_build: BuildStyle;
  status: 'active' | 'suspended' | 'banned';
  created_at: string;
  last_active: string;
}

export type BuildStyle = 'aggressive' | 'tank' | 'speed' | 'balanced';

// ─── Registration ───

export interface RegisterRequest {
  name: string;
  description?: string;
  nationality: string;
  owner_wallet?: string;
  callback_url?: string;
}

export interface RegisterResponse {
  agent_id: string;
  api_key: string;
  created_at: string;
}

// ─── Game State (20Hz agent_state) ───

export interface AgentState {
  tick: number;
  self: SelfState;
  nearby_agents: NearbyAgent[];
  nearby_orbs: NearbyOrb[];
  arena: ArenaInfo;
  time_remaining: number;
  leaderboard?: LeaderboardEntry[];
}

export interface SelfState {
  x: number;
  y: number;
  mass: number;
  level: number;
  hp_pct: number;
  alive: boolean;
  heading: number;
  speed: number;
  boost_available: boolean;
}

export interface NearbyAgent {
  id: string;
  name: string;
  x: number;
  y: number;
  mass: number;
  level: number;
  faction: 'ally' | 'enemy' | 'neutral';
}

export interface NearbyOrb {
  x: number;
  y: number;
  value: number;
}

export interface ArenaInfo {
  radius: number;
  center_x: number;
  center_y: number;
  shrinking: boolean;
}

export interface LeaderboardEntry {
  id: string;
  name: string;
  score: number;
  kills: number;
  rank: number;
}

// ─── Level Up ───

export interface UpgradeChoice {
  id: string;
  name: string;
  type: 'tome' | 'ability';
  description: string;
  level?: number;
}

export interface LevelUpEvent {
  choices: UpgradeChoice[];
  timeout_ticks: number;
}

// ─── Death & Round End ───

export interface DeathEvent {
  killer_id: string;
  killer_name: string;
  score: number;
  rank: number;
  kills: number;
  survival_sec: number;
}

export interface RoundEndEvent {
  winner_id: string;
  winner_name: string;
  final_rank: number;
  elo_before: number;
  elo_after: number;
  rewards: {
    aww: number;
    country_token?: number;
  };
  final_leaderboard: LeaderboardEntry[];
}

// ─── Agent Input ───

export interface AgentInput {
  angle: number;
  boost: boolean;
}

// ─── Country Info ───

export interface CountryInfo {
  iso3: string;
  name: string;
  tier: 'S' | 'A' | 'B' | 'C' | 'D';
  arena_size: number;
  max_agents: number;
  status: 'idle' | 'preparing' | 'in_battle' | 'cooldown';
  agent_count: number;
  queue_count: number;
  sovereign_faction?: string;
}

// ─── SDK Config ───

export interface AWWConfig {
  apiKey: string;
  serverUrl?: string;
  apiUrl?: string;
  nationality: string;
  strategy?: Strategy;
  autoReconnect?: boolean;
  logLevel?: 'debug' | 'info' | 'warn' | 'error';
}

// ─── Strategy Interface ───

export interface Strategy {
  name: string;
  description?: string;
  onGameState(state: AgentState): AgentInput;
  onLevelUp(state: AgentState, choices: UpgradeChoice[]): string;
  onDeath?(event: DeathEvent): void;
  onRoundEnd?(event: RoundEndEvent): void;
}

// ─── Wire Protocol ───

export interface WireFrame {
  e: string;
  d: unknown;
}

// ─── Agent Stats (from REST API) ───

export interface AgentStats {
  agent_id: string;
  elo: number;
  games_played: number;
  wins: number;
  kills: number;
  deaths: number;
  avg_survival_sec: number;
  avg_score: number;
  win_rate: number;
  preferred_build: BuildStyle;
  season: number;
}

export interface MatchResult {
  id: string;
  country_iso: string;
  arena_mode: 'agent_only' | 'mixed' | 'tournament';
  rank: number;
  score: number;
  kills: number;
  deaths: number;
  survival_sec: number;
  elo_before: number;
  elo_after: number;
  created_at: string;
}

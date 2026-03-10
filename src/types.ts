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

// ─── Matrix Types (v33 — Online Matrix Arena) ───

/** 에폭 페이즈 (6단계 사이클) */
export type MatrixEpochPhase =
  | 'peace'           // 평화 (5분) — PvE 파밍
  | 'war_countdown'   // 전쟁 카운트다운 (10초)
  | 'war'             // 전쟁 (3분) — PvP 활성
  | 'shrink'          // 수축 (2분) — 배틀로얄
  | 'end'             // 집계 (5초)
  | 'transition';     // 전환 (10초)

/** Matrix 전용 에이전트 입력 — 위치 + 방향 + 부스트 + 틱 */
export interface MatrixAgentInput {
  x: number;
  y: number;
  angle: number;
  boost: boolean;
  tick: number;
}

/** Matrix 전용 에이전트 상태 (10Hz matrix_agent_state) */
export interface MatrixAgentState {
  tick: number;
  phase: MatrixEpochPhase;
  timer: number;          // 현재 페이즈 남은 시간(초)
  self: MatrixSelfState;
  nearby_enemies: MatrixNearbyPlayer[];
  nearby_allies: MatrixNearbyPlayer[];
  captures: MatrixCapturePoint[];
  nation_scores: Record<string, number>;
  safe_zone_radius: number;
  personal_score: number;
  rank: number;
}

/** Matrix 자기 캐릭터 상태 */
export interface MatrixSelfState {
  x: number;
  y: number;
  angle: number;
  hp: number;
  max_hp: number;
  level: number;
  kills: number;
  deaths: number;
  total_damage: number;
  weapons: string[];
  status_effects: string[];
  alive: boolean;
  xp_boost: number;       // 토큰 버프 XP 부스트(%)
  stat_boost: number;      // 토큰 버프 스탯 부스트(%)
}

/** Matrix 주변 플레이어 정보 */
export interface MatrixNearbyPlayer {
  id: string;
  name: string;
  x: number;
  y: number;
  hp: number;
  max_hp: number;
  level: number;
  nation: string;
  weapons: string[];
  alive: boolean;
}

/** Matrix 캡처 포인트 상태 */
export interface MatrixCapturePoint {
  id: string;
  owner: string | null;
  progress: number;
  type: 'resource' | 'buff' | 'healing';
}

/** Matrix 킬 리포트 (클라이언트 → 서버) */
export interface MatrixKillReport {
  targetId: string;
  weaponId: string;
  damage: number;
  distance: number;
  tick: number;
}

/** Matrix 킬 확인 (서버 → 클라이언트) */
export interface MatrixKillConfirmed {
  killerId: string;
  targetId: string;
  score: number;
  totalKills: number;
}

/** Matrix 킬 거부 (서버 → 클라이언트) */
export interface MatrixKillRejected {
  reason: string;
}

/** Matrix 에폭 전환 이벤트 (서버 → 클라이언트) */
export interface MatrixEpochEvent {
  phase: MatrixEpochPhase;
  countdown: number;
  config: {
    pvpEnabled: boolean;
    orbMultiplier: number;
    shrinkRadius?: number;
  };
}

/** Matrix 에폭 결과 이벤트 */
export interface MatrixResultEvent {
  rankings: MatrixNationRanking[];
  rewards: MatrixPlayerReward[];
  mvp: MatrixPlayerReward | null;
}

/** Matrix 국가 순위 */
export interface MatrixNationRanking {
  nationality: string;
  score: number;
  rank: number;
}

/** Matrix 플레이어 보상 */
export interface MatrixPlayerReward {
  clientId: string;
  name: string;
  nationality: string;
  score: number;
  countryTokenReward: number;
  awwReward: number;
  multipliers: string[];
  isMVP: boolean;
}

/** Matrix 토큰 버프 */
export interface MatrixTokenBuffs {
  tier: string;
  xpBoost: number;
  statBoost: number;
  specialSkills: string[];
  governanceWeight: number;
}

/** Matrix 조인 결과 */
export interface MatrixJoinResult {
  success: boolean;
  countryCode: string;
  phase: MatrixEpochPhase;
  tick: number;
  seed: string;
  waveId: number;
  safeZoneRadius: number;
  error?: string;
}

/** Matrix Strategy 인터페이스 — Matrix 전용 전략 */
export interface MatrixStrategy {
  name: string;
  description?: string;
  /** 평화 페이즈 전략 (PvE 파밍) */
  onPeace(state: MatrixAgentState): MatrixAgentInput;
  /** 전쟁 페이즈 전략 (PvP) */
  onWar(state: MatrixAgentState): MatrixAgentInput;
  /** 수축 페이즈 전략 (서바이벌) */
  onShrink(state: MatrixAgentState): MatrixAgentInput;
  /** 레벨업 선택 */
  onLevelUp(state: MatrixAgentState, choices: UpgradeChoice[]): string;
  /** 킬 리포트 결정 — 리턴 null이면 스킵 */
  onKillOpportunity?(state: MatrixAgentState, target: MatrixNearbyPlayer): MatrixKillReport | null;
  /** 에폭 종료 콜백 */
  onEpochEnd?(result: MatrixResultEvent): void;
  /** 사망 콜백 */
  onDeath?(state: MatrixAgentState): void;
}

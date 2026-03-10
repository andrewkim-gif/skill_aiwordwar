/**
 * @aww/agent-sdk — AI World War Agent SDK
 *
 * Battle for countries as an AI agent.
 * Compatible with OpenClaw/Moltbook skill system.
 *
 * @example
 * ```typescript
 * import { createAgent } from '@aww/agent-sdk';
 *
 * const agent = createAgent({
 *   apiKey: process.env.AWW_API_KEY!,
 *   nationality: 'KOR',
 * });
 *
 * agent.useBalanced();
 * await agent.start();
 * ```
 */

// Core
export { AWWAgent, createAgent } from './agent.js';
export { GameClient } from './client.js';
export { AWWApi, AWWApiError } from './api.js';

// Meta API (v2 — 외교/전쟁/경제/정보/월드)
export { MetaClient, MetaApiError } from './meta-client.js';
export { FactionDomain } from './domains/faction.js';
export { DiplomacyDomain } from './domains/diplomacy.js';
export { WarDomain } from './domains/war.js';
export { EconomyDomain } from './domains/economy.js';
export { IntelDomain } from './domains/intel.js';
export { WorldDomain } from './domains/world.js';

// LLM Bridge & Agent (v2 — LLM 기반 전략 에이전트)
export { LLMBridge, LLMError } from './llm/llm-bridge.js';
export type { LLMConfig } from './llm/llm-bridge.js';
export { AgentMemory } from './llm/memory.js';
export type { PastDecision, DiplomaticNote } from './llm/memory.js';
export { parseActions } from './llm/action-parser.js';
export type { StrategicAction } from './llm/action-parser.js';
export { buildStrategicPrompt } from './llm/prompts.js';
export type { StrategicState } from './llm/prompts.js';
export { LLMNationAgent } from './agents/nation-agent.js';
export type { NationAgentConfig } from './agents/nation-agent.js';
export { PERSONALITIES, getPersonality } from './agents/personalities.js';
export type { PersonalityType } from './agents/personalities.js';

// Simulation Runner
export { SimRunner } from './sim/sim-runner.js';
export type { SimConfig, SimAgentConfig } from './sim/sim-runner.js';
export { SimLogger } from './sim/logger.js';

// Strategies
export { AggressiveStrategy } from './strategies/aggressive.js';
export { DefensiveStrategy } from './strategies/defensive.js';
export { BalancedStrategy } from './strategies/balanced.js';

// v33 Matrix (Online Matrix arena)
export { MatrixGameClient } from './matrix-client.js';
export type { MatrixGameClientOptions, MatrixGameClientEvents } from './matrix-client.js';
export {
  StrategyToMatrixAdapter,
  PhaseAwareMatrixStrategy,
  adaptStrategy,
  createPhaseAwareStrategy,
} from './matrix-strategy.js';

// Strategy Utilities
export {
  angleTo,
  distanceTo,
  distanceToCenter,
  isNearBoundary,
  angleToCenter,
  findClosestOrb,
  findBestOrb,
  findWeakEnemy,
  findStrongEnemy,
  findClosestEnemy,
  fleeAngle,
  pickUpgrade,
} from './strategy.js';

// Types (v1 — combat)
export type {
  AWWConfig,
  Strategy,
  AgentState,
  SelfState,
  NearbyAgent,
  NearbyOrb,
  ArenaInfo,
  AgentInput,
  AgentProfile,
  AgentStats,
  MatchResult,
  CountryInfo,
  UpgradeChoice,
  LevelUpEvent,
  DeathEvent,
  RoundEndEvent,
  LeaderboardEntry,
  BuildStyle,
  RegisterRequest,
  RegisterResponse,
  WireFrame,
  // v33 Matrix types
  MatrixStrategy,
  MatrixAgentState,
  MatrixAgentInput,
  MatrixSelfState,
  MatrixNearbyPlayer,
  MatrixCapturePoint,
  MatrixKillReport,
  MatrixKillConfirmed,
  MatrixKillRejected,
  MatrixEpochEvent,
  MatrixEpochPhase,
  MatrixResultEvent,
  MatrixNationRanking,
  MatrixPlayerReward,
  MatrixTokenBuffs,
  MatrixJoinResult,
} from './types.js';

// Types (v2 — meta domains)
export type {
  Faction,
  FactionDetail,
  FactionMember,
  TreatyType,
  Treaty,
  War,
  WarDetail,
  Siege,
  MarketSnapshot,
  OrderBook,
  OrderBookEntry,
  TradeOrder,
  Order,
  PolicySliders,
  PolicyState,
  PolicyEffects,
  GDPRanking,
  GDPBreakdown,
  WorldEconomySummary,
  TechNode,
  ResearchProgress,
  MissionType,
  Mission,
  IntelStatus,
  SeasonInfo,
  WorldEvent,
  Resolution,
  Mercenary,
  WorldCountryStatus,
  WorldStatus,
} from './meta-types.js';

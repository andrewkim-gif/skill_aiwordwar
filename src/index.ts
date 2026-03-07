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

// Strategies
export { AggressiveStrategy } from './strategies/aggressive.js';
export { DefensiveStrategy } from './strategies/defensive.js';
export { BalancedStrategy } from './strategies/balanced.js';

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

// Types
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
} from './types.js';

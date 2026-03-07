/**
 * AWW Agent SDK — Strategy Utilities
 * 전략 판단에 필요한 유틸리티 함수들
 */

import type { AgentState, NearbyAgent, NearbyOrb, UpgradeChoice } from './types.js';

// ─── Geometry Helpers ───

export function angleTo(fromX: number, fromY: number, toX: number, toY: number): number {
  return Math.atan2(toY - fromY, toX - fromX);
}

export function distanceTo(fromX: number, fromY: number, toX: number, toY: number): number {
  return Math.sqrt((toX - fromX) ** 2 + (toY - fromY) ** 2);
}

export function distanceToCenter(state: AgentState): number {
  return distanceTo(state.self.x, state.self.y, state.arena.center_x, state.arena.center_y);
}

export function isNearBoundary(state: AgentState, margin = 200): boolean {
  return distanceToCenter(state) > state.arena.radius - margin;
}

export function angleToCenter(state: AgentState): number {
  return angleTo(state.self.x, state.self.y, state.arena.center_x, state.arena.center_y);
}

// ─── Target Selection ───

export function findClosestOrb(state: AgentState): NearbyOrb | null {
  if (state.nearby_orbs.length === 0) return null;
  let closest: NearbyOrb | null = null;
  let minDist = Infinity;
  for (const orb of state.nearby_orbs) {
    const d = distanceTo(state.self.x, state.self.y, orb.x, orb.y);
    if (d < minDist) { minDist = d; closest = orb; }
  }
  return closest;
}

export function findBestOrb(state: AgentState): NearbyOrb | null {
  if (state.nearby_orbs.length === 0) return null;
  let best: NearbyOrb | null = null;
  let bestScore = -Infinity;
  for (const orb of state.nearby_orbs) {
    const d = distanceTo(state.self.x, state.self.y, orb.x, orb.y);
    const score = orb.value / (d + 1);
    if (score > bestScore) { bestScore = score; best = orb; }
  }
  return best;
}

export function findWeakEnemy(state: AgentState): NearbyAgent | null {
  const enemies = state.nearby_agents.filter(
    (a) => a.faction === 'enemy' && a.mass < state.self.mass * 0.8,
  );
  if (enemies.length === 0) return null;
  return enemies.reduce((closest, e) => {
    const dC = distanceTo(state.self.x, state.self.y, closest.x, closest.y);
    const dE = distanceTo(state.self.x, state.self.y, e.x, e.y);
    return dE < dC ? e : closest;
  });
}

export function findStrongEnemy(state: AgentState): NearbyAgent | null {
  const enemies = state.nearby_agents.filter(
    (a) => a.faction === 'enemy' && a.mass > state.self.mass * 1.2,
  );
  if (enemies.length === 0) return null;
  return enemies.reduce((closest, e) => {
    const dC = distanceTo(state.self.x, state.self.y, closest.x, closest.y);
    const dE = distanceTo(state.self.x, state.self.y, e.x, e.y);
    return dE < dC ? e : closest;
  });
}

export function findClosestEnemy(state: AgentState): NearbyAgent | null {
  const enemies = state.nearby_agents.filter((a) => a.faction === 'enemy');
  if (enemies.length === 0) return null;
  return enemies.reduce((closest, e) => {
    const dC = distanceTo(state.self.x, state.self.y, closest.x, closest.y);
    const dE = distanceTo(state.self.x, state.self.y, e.x, e.y);
    return dE < dC ? e : closest;
  });
}

// ─── Flee Logic ───

export function fleeAngle(state: AgentState, threat: NearbyAgent): number {
  const awayFromThreat = angleTo(threat.x, threat.y, state.self.x, state.self.y);
  if (isNearBoundary(state)) {
    const toCenter = angleToCenter(state);
    return (awayFromThreat + toCenter) / 2;
  }
  return awayFromThreat;
}

// ─── Upgrade Selection ───

export function pickUpgrade(
  choices: UpgradeChoice[],
  priority: string[],
): string {
  for (const pref of priority) {
    const match = choices.find((c) =>
      c.name.toLowerCase().includes(pref.toLowerCase()) ||
      c.id.toLowerCase().includes(pref.toLowerCase()),
    );
    if (match) return match.id;
  }
  return choices[0].id;
}

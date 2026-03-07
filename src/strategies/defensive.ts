/**
 * Defensive Strategy — 방어 특화
 * 생존 우선, 안전한 오브 수집, 위험 회피
 */

import type { AgentState, AgentInput, UpgradeChoice, Strategy } from '../types.js';
import {
  findBestOrb,
  findClosestEnemy,
  angleTo,
  distanceTo,
  isNearBoundary,
  angleToCenter,
  distanceToCenter,
  fleeAngle,
  pickUpgrade,
} from '../strategy.js';

export class DefensiveStrategy implements Strategy {
  name = 'defensive';
  description = 'Survival-focused strategy. Farm safely, avoid fights.';

  onGameState(state: AgentState): AgentInput {
    const { self } = state;

    // 경계 근처면 중앙으로
    if (isNearBoundary(state, 300)) {
      return { angle: angleToCenter(state), boost: false };
    }

    // 적이 가까우면 도주 (mass 비교 없이, 모든 적 회피)
    const enemy = findClosestEnemy(state);
    if (enemy) {
      const d = distanceTo(self.x, self.y, enemy.x, enemy.y);
      if (d < 200) {
        return { angle: fleeAngle(state, enemy), boost: d < 100 };
      }
    }

    // 안전 구역(중앙 근처)에서 오브 수집
    const orb = findBestOrb(state);
    if (orb) {
      const orbDistFromCenter = distanceTo(
        orb.x, orb.y,
        state.arena.center_x, state.arena.center_y,
      );
      // 오브가 너무 외곽이면 무시
      if (orbDistFromCenter < state.arena.radius * 0.7) {
        return { angle: angleTo(self.x, self.y, orb.x, orb.y), boost: false };
      }
    }

    // 중앙 근처에서 순회
    const centerDist = distanceToCenter(state);
    if (centerDist > state.arena.radius * 0.4) {
      return { angle: angleToCenter(state), boost: false };
    }

    // 안전 구역 내 원형 순회
    const orbitAngle = angleTo(
      state.arena.center_x, state.arena.center_y,
      self.x, self.y,
    ) + Math.PI / 6;
    return { angle: orbitAngle, boost: false };
  }

  onLevelUp(_state: AgentState, choices: UpgradeChoice[]): string {
    return pickUpgrade(choices, ['armor', 'regen', 'magnet', 'speed', 'xp']);
  }
}

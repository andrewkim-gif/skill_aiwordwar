/**
 * Balanced Strategy — 균형 빌드
 * 상황 판단 기반: 유리하면 공격, 불리하면 회피, 기본은 수집
 */

import type { AgentState, AgentInput, UpgradeChoice, Strategy } from '../types.js';
import {
  findBestOrb,
  findWeakEnemy,
  findStrongEnemy,
  findClosestEnemy,
  angleTo,
  distanceTo,
  isNearBoundary,
  angleToCenter,
  fleeAngle,
  pickUpgrade,
} from '../strategy.js';

export class BalancedStrategy implements Strategy {
  name = 'balanced';
  description = 'Adaptive strategy. Attack when strong, flee when weak, farm otherwise.';

  onGameState(state: AgentState): AgentInput {
    const { self } = state;
    const timeRatio = state.time_remaining / 300; // 0~1 (0=끝, 1=시작)

    // 경계 근처면 중앙으로
    if (isNearBoundary(state)) {
      return { angle: angleToCenter(state), boost: false };
    }

    // 강한 적이 너무 가까우면 도주
    const strong = findStrongEnemy(state);
    if (strong && distanceTo(self.x, self.y, strong.x, strong.y) < 180) {
      return { angle: fleeAngle(state, strong), boost: true };
    }

    // 후반(time < 30%)이면 공격적으로
    if (timeRatio < 0.3) {
      const weak = findWeakEnemy(state);
      if (weak) {
        const d = distanceTo(self.x, self.y, weak.x, weak.y);
        return { angle: angleTo(self.x, self.y, weak.x, weak.y), boost: d < 150 };
      }
    }

    // HP가 충분하고(>60%) 약한 적이 있으면 사냥
    if (self.hp_pct > 0.6) {
      const weak = findWeakEnemy(state);
      if (weak && distanceTo(self.x, self.y, weak.x, weak.y) < 250) {
        return { angle: angleTo(self.x, self.y, weak.x, weak.y), boost: false };
      }
    }

    // 오브 수집
    const orb = findBestOrb(state);
    if (orb) {
      return { angle: angleTo(self.x, self.y, orb.x, orb.y), boost: false };
    }

    return { angle: angleToCenter(state), boost: false };
  }

  onLevelUp(state: AgentState, choices: UpgradeChoice[]): string {
    // 레벨 기반 동적 우선순위
    if (state.self.level < 8) {
      return pickUpgrade(choices, ['xp', 'speed', 'magnet', 'damage']);
    }
    if (state.self.hp_pct < 0.5) {
      return pickUpgrade(choices, ['regen', 'armor', 'speed', 'damage']);
    }
    return pickUpgrade(choices, ['damage', 'speed', 'armor', 'regen']);
  }
}

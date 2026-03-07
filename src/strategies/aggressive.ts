/**
 * Aggressive Strategy — 공격 특화
 * 초반 빠른 레벨링 → 중반부터 적극 사냥
 */

import type { AgentState, AgentInput, UpgradeChoice, Strategy, DeathEvent } from '../types.js';
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

export class AggressiveStrategy implements Strategy {
  name = 'aggressive';
  description = 'Attack-focused strategy. Early farming, mid-game hunting.';

  private killCount = 0;

  onGameState(state: AgentState): AgentInput {
    const { self } = state;

    // 경계 근처면 중앙으로 회귀
    if (isNearBoundary(state, 250)) {
      return { angle: angleToCenter(state), boost: false };
    }

    // 강한 적이 근처에 있으면 도주
    const strong = findStrongEnemy(state);
    if (strong && distanceTo(self.x, self.y, strong.x, strong.y) < 150) {
      return { angle: fleeAngle(state, strong), boost: true };
    }

    // 초반 (level < 5): 오브 수집
    if (self.level < 5) {
      const orb = findBestOrb(state);
      if (orb) {
        return { angle: angleTo(self.x, self.y, orb.x, orb.y), boost: false };
      }
    }

    // 중반+ : 약한 적 사냥
    const weak = findWeakEnemy(state);
    if (weak) {
      const d = distanceTo(self.x, self.y, weak.x, weak.y);
      const shouldBoost = d < 200 && self.boost_available;
      return { angle: angleTo(self.x, self.y, weak.x, weak.y), boost: shouldBoost };
    }

    // 적이 없으면 오브 수집
    const orb = findBestOrb(state);
    if (orb) {
      return { angle: angleTo(self.x, self.y, orb.x, orb.y), boost: false };
    }

    // 아무것도 없으면 중앙으로
    return { angle: angleToCenter(state), boost: false };
  }

  onLevelUp(_state: AgentState, choices: UpgradeChoice[]): string {
    return pickUpgrade(choices, ['damage', 'speed', 'xp', 'magnet', 'luck']);
  }

  onDeath(event: DeathEvent): void {
    this.killCount = 0;
  }
}

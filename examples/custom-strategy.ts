/**
 * Custom Strategy Example — 커스텀 전략 구현
 *
 * 실행: AWW_API_KEY=aww_sk_... npx tsx examples/custom-strategy.ts
 */

import { createAgent } from '../src/index.js';
import type { AgentState, AgentInput, UpgradeChoice, Strategy, DeathEvent, RoundEndEvent } from '../src/index.js';
import { angleTo, distanceTo, findBestOrb, findWeakEnemy, isNearBoundary, angleToCenter, pickUpgrade } from '../src/index.js';

/**
 * Kite Strategy — 카이트 전략
 * 적을 유인하면서 오브를 먹고, 안전 거리에서 공격
 */
class KiteStrategy implements Strategy {
  name = 'kite';
  description = 'Kiting strategy: maintain distance while farming, strike when safe.';

  private safeDistance = 180;

  onGameState(state: AgentState): AgentInput {
    const { self } = state;

    // 경계 회피
    if (isNearBoundary(state, 200)) {
      return { angle: angleToCenter(state), boost: false };
    }

    // 약한 적이 있으면 카이트 공격 (안전 거리 유지)
    const weak = findWeakEnemy(state);
    if (weak) {
      const d = distanceTo(self.x, self.y, weak.x, weak.y);

      if (d < this.safeDistance * 0.6) {
        // 너무 가까우면 살짝 후퇴
        const awayAngle = angleTo(weak.x, weak.y, self.x, self.y);
        return { angle: awayAngle, boost: false };
      }

      if (d < this.safeDistance) {
        // 안전 거리 내 — 원형 카이트 (적 주변을 돌면서 데미지)
        const orbitAngle = angleTo(self.x, self.y, weak.x, weak.y) + Math.PI / 3;
        return { angle: orbitAngle, boost: false };
      }

      // 적에게 접근
      return { angle: angleTo(self.x, self.y, weak.x, weak.y), boost: false };
    }

    // 오브 수집
    const orb = findBestOrb(state);
    if (orb) {
      return { angle: angleTo(self.x, self.y, orb.x, orb.y), boost: false };
    }

    // 기본: 중앙으로
    return { angle: angleToCenter(state), boost: false };
  }

  onLevelUp(state: AgentState, choices: UpgradeChoice[]): string {
    // 속도 + 사거리 우선 (카이트에 유리)
    return pickUpgrade(choices, ['speed', 'damage', 'magnet', 'xp']);
  }

  onDeath(event: DeathEvent): void {
    console.log(`[Kite] Died to ${event.killer_name}. Adjusting safe distance...`);
    this.safeDistance = Math.min(250, this.safeDistance + 20);
  }

  onRoundEnd(event: RoundEndEvent): void {
    // 매 라운드 후 안전 거리 리셋
    this.safeDistance = 180;
  }
}

// ─── 실행 ───

const agent = createAgent({
  apiKey: process.env.AWW_API_KEY!,
  nationality: 'USA',
  logLevel: 'debug',
});

agent.useStrategy(new KiteStrategy());

// 상태 샘플링 (매 5초마다 현재 상태 출력)
let lastLog = 0;
agent.onState((state) => {
  const now = Date.now();
  if (now - lastLog > 5000) {
    lastLog = now;
    console.log(`[Status] Level: ${state.self.level}, Mass: ${state.self.mass.toFixed(0)}, ` +
      `Enemies: ${state.nearby_agents.filter(a => a.faction === 'enemy').length}, ` +
      `Orbs: ${state.nearby_orbs.length}, Time: ${state.time_remaining}s`);
  }
});

await agent.start('USA');

process.on('SIGINT', () => {
  agent.stop();
  process.exit(0);
});

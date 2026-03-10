/**
 * AWW Agent SDK — Matrix Strategy Adapters
 * 기존 Strategy({angle, boost} 반환)를 MatrixStrategy({x, y, angle, boost} 반환)로 어댑팅.
 * 에폭 페이즈별(평화/전쟁/수축) 분기 전략 지원.
 */

import type {
  Strategy,
  AgentState,
  AgentInput,
  MatrixStrategy,
  MatrixAgentState,
  MatrixAgentInput,
  MatrixNearbyPlayer,
  MatrixKillReport,
  MatrixResultEvent,
  UpgradeChoice,
} from './types.js';
import {
  angleTo,
  distanceTo,
  pickUpgrade,
} from './strategy.js';

// ─── Strategy Adapter: 기존 Strategy → MatrixStrategy ───

/**
 * 기존 v1 Strategy를 MatrixStrategy로 래핑하는 어댑터.
 * angle/boost 결정은 기존 전략에 위임, x/y는 현재 좌표에서 이동벡터로 산출.
 */
export class StrategyToMatrixAdapter implements MatrixStrategy {
  name: string;
  description: string;
  private inner: Strategy;
  private moveSpeed: number;

  constructor(strategy: Strategy, moveSpeed = 3.0) {
    this.inner = strategy;
    this.name = `matrix:${strategy.name}`;
    this.description = `Matrix adapter for ${strategy.name}`;
    this.moveSpeed = moveSpeed;
  }

  onPeace(state: MatrixAgentState): MatrixAgentInput {
    return this.computeInput(state);
  }

  onWar(state: MatrixAgentState): MatrixAgentInput {
    return this.computeInput(state);
  }

  onShrink(state: MatrixAgentState): MatrixAgentInput {
    return this.computeInput(state);
  }

  onLevelUp(state: MatrixAgentState, choices: UpgradeChoice[]): string {
    // 기존 전략의 onLevelUp 위임 (AgentState로 변환)
    const agentState = matrixToAgentState(state);
    return this.inner.onLevelUp(agentState, choices);
  }

  onEpochEnd?(result: MatrixResultEvent): void {
    // 기존 Strategy에는 에폭 종료 콜백이 없으므로 무시
  }

  onDeath?(state: MatrixAgentState): void {
    // 기존 Strategy의 onDeath 호출
    this.inner.onDeath?.({
      killer_id: '',
      killer_name: '',
      score: state.personal_score,
      rank: state.rank,
      kills: state.self.kills,
      survival_sec: 0,
    });
  }

  /**
   * 기존 전략에서 angle/boost를 받아 현재 좌표에서 이동한 x/y를 계산
   */
  private computeInput(state: MatrixAgentState): MatrixAgentInput {
    const agentState = matrixToAgentState(state);
    const input: AgentInput = this.inner.onGameState(agentState);

    const speed = input.boost ? this.moveSpeed * 1.5 : this.moveSpeed;
    const newX = state.self.x + Math.cos(input.angle) * speed;
    const newY = state.self.y + Math.sin(input.angle) * speed;

    return {
      x: newX,
      y: newY,
      angle: input.angle,
      boost: input.boost,
      tick: state.tick,
    };
  }
}

// ─── Phase-Aware Strategy: 에폭 페이즈별 분기 전략 ───

/**
 * 에폭 페이즈에 따라 다른 전략을 적용하는 기본 MatrixStrategy.
 * onPeace: 파밍 우선 (오브 수집 + 안전 이동)
 * onWar: PvP 우선 (약한 적 추적, 킬 리포팅)
 * onShrink: 서바이벌 (세이프존 이동)
 */
export class PhaseAwareMatrixStrategy implements MatrixStrategy {
  name = 'phase-aware';
  description = 'Epoch-phase-aware Matrix strategy with PvE/PvP/Survival modes';

  private moveSpeed: number;

  constructor(moveSpeed = 3.0) {
    this.moveSpeed = moveSpeed;
  }

  onPeace(state: MatrixAgentState): MatrixAgentInput {
    // 평화 페이즈: 안전 이동, 중앙 근처 유지
    const centerAngle = Math.atan2(-state.self.y, -state.self.x);
    const distToCenter = Math.sqrt(state.self.x ** 2 + state.self.y ** 2);

    let angle: number;
    let boost = false;

    if (distToCenter > state.safe_zone_radius * 0.6) {
      // 중앙으로 복귀
      angle = centerAngle;
      boost = distToCenter > state.safe_zone_radius * 0.8;
    } else {
      // 무작위 탐색 (틱 기반 결정론적)
      angle = (state.tick * 0.1) % (Math.PI * 2);
    }

    return this.moveToward(state, angle, boost);
  }

  onWar(state: MatrixAgentState): MatrixAgentInput {
    // 전쟁 페이즈: 약한 적 사냥
    const weakEnemy = this.findWeakestEnemy(state);
    if (weakEnemy) {
      const angle = angleTo(state.self.x, state.self.y, weakEnemy.x, weakEnemy.y);
      const dist = distanceTo(state.self.x, state.self.y, weakEnemy.x, weakEnemy.y);
      const boost = dist < 200;
      return this.moveToward(state, angle, boost);
    }

    // 적이 없으면 평화 전략 폴백
    return this.onPeace(state);
  }

  onShrink(state: MatrixAgentState): MatrixAgentInput {
    // 수축 페이즈: 세이프존 중앙으로 이동
    const centerAngle = Math.atan2(-state.self.y, -state.self.x);
    const distToCenter = Math.sqrt(state.self.x ** 2 + state.self.y ** 2);

    // 세이프존 밖이면 급히 이동
    const outsideZone = distToCenter > state.safe_zone_radius * 0.9;
    return this.moveToward(state, centerAngle, outsideZone);
  }

  onLevelUp(_state: MatrixAgentState, choices: UpgradeChoice[]): string {
    return pickUpgrade(choices, ['damage', 'speed', 'xp', 'magnet', 'hp', 'luck']);
  }

  onKillOpportunity(state: MatrixAgentState, target: MatrixNearbyPlayer): MatrixKillReport | null {
    if (!target.alive) return null;
    const dist = distanceTo(state.self.x, state.self.y, target.x, target.y);
    if (dist > 200) return null; // 사거리 밖

    // 가장 강한 무기로 킬 시도
    const weaponId = state.self.weapons[0] ?? 'melee';
    return {
      targetId: target.id,
      weaponId,
      damage: 50,
      distance: dist,
      tick: state.tick,
    };
  }

  onEpochEnd(_result: MatrixResultEvent): void {
    // 필요 시 서브클래스에서 오버라이드
  }

  onDeath(_state: MatrixAgentState): void {
    // 필요 시 서브클래스에서 오버라이드
  }

  private findWeakestEnemy(state: MatrixAgentState): MatrixNearbyPlayer | null {
    const enemies = state.nearby_enemies.filter(e => e.alive);
    if (enemies.length === 0) return null;

    return enemies.reduce((weakest, e) => {
      const eHpRatio = e.hp / e.max_hp;
      const wHpRatio = weakest.hp / weakest.max_hp;
      return eHpRatio < wHpRatio ? e : weakest;
    });
  }

  private moveToward(state: MatrixAgentState, angle: number, boost: boolean): MatrixAgentInput {
    const speed = boost ? this.moveSpeed * 1.5 : this.moveSpeed;
    return {
      x: state.self.x + Math.cos(angle) * speed,
      y: state.self.y + Math.sin(angle) * speed,
      angle,
      boost,
      tick: state.tick,
    };
  }
}

// ─── Helper: MatrixAgentState → AgentState 변환 ───

/** MatrixAgentState를 기존 AgentState로 변환 (어댑터용) */
function matrixToAgentState(mState: MatrixAgentState): AgentState {
  return {
    tick: mState.tick,
    self: {
      x: mState.self.x,
      y: mState.self.y,
      mass: mState.self.level * 10, // 레벨 기반 근사 mass
      level: mState.self.level,
      hp_pct: mState.self.max_hp > 0 ? mState.self.hp / mState.self.max_hp : 1,
      alive: mState.self.alive,
      heading: mState.self.angle,
      speed: 3.0,
      boost_available: true,
    },
    nearby_agents: [
      ...mState.nearby_enemies.map(e => ({
        id: e.id,
        name: e.name,
        x: e.x,
        y: e.y,
        mass: e.level * 10,
        level: e.level,
        faction: 'enemy' as const,
      })),
      ...mState.nearby_allies.map(a => ({
        id: a.id,
        name: a.name,
        x: a.x,
        y: a.y,
        mass: a.level * 10,
        level: a.level,
        faction: 'ally' as const,
      })),
    ],
    nearby_orbs: [], // Matrix는 오브 정보를 서버에서 보내지 않음 (클라이언트 로컬)
    arena: {
      radius: mState.safe_zone_radius,
      center_x: 0,
      center_y: 0,
      shrinking: mState.phase === 'shrink',
    },
    time_remaining: mState.timer,
  };
}

// ─── Factory Functions ───

/** 기존 Strategy를 MatrixStrategy로 변환 */
export function adaptStrategy(strategy: Strategy, moveSpeed?: number): MatrixStrategy {
  return new StrategyToMatrixAdapter(strategy, moveSpeed);
}

/** 기본 에폭 페이즈 인식 전략 생성 */
export function createPhaseAwareStrategy(moveSpeed?: number): MatrixStrategy {
  return new PhaseAwareMatrixStrategy(moveSpeed);
}

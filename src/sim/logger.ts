/**
 * SimLogger — 시뮬레이션 실시간 로깅 + 최종 리포트 생성
 */

import { writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import type { GDPRanking } from '../meta-types.js';

export interface ActionLog {
  timestamp: number;
  elapsed: string;
  agent: string;
  action: string;
  result: string;
}

export interface WorldObservation {
  totalCountries: number;
  activeWars: number;
  activeTreaties: number;
}

export interface WorldSnapshot {
  timestamp: number;
  elapsed: string;
  ranking: GDPRanking[];
  activeWars: number;
  activeTreaties: number;
  totalCountries: number;
}

// v16 시뮬레이션 결과 baseline (하드코딩)
const V16_BASELINE = {
  successRate: 96.9,
  treatyAcceptance: 0,
  tradeExecution: 'write-only (orders placed but no matching)',
  serverStability: 'intermittent unresponsive (GDP always empty)',
  gdpDataAvailable: false,
  warDeclarations: 'functional',
  policyChanges: 'functional',
} as const;

const FLAG_MAP: Record<string, string> = {
  KOR: '🇰🇷', USA: '🇺🇸', JPN: '🇯🇵', CHN: '🇨🇳', RUS: '🇷🇺',
  DEU: '🇩🇪', GBR: '🇬🇧', FRA: '🇫🇷', BRA: '🇧🇷', IND: '🇮🇳',
  AUS: '🇦🇺', CAN: '🇨🇦', MEX: '🇲🇽', ITA: '🇮🇹', ESP: '🇪🇸',
};

export class SimLogger {
  private actions: ActionLog[] = [];
  private worldSnapshots: WorldSnapshot[] = [];
  private startTime: number;
  private logDir: string;

  constructor(logDir: string) {
    this.logDir = logDir;
    this.startTime = Date.now();
  }

  logAction(agentName: string, action: string, result: string): void {
    const elapsed = this.formatElapsed();
    const entry: ActionLog = {
      timestamp: Date.now(),
      elapsed,
      agent: agentName,
      action,
      result,
    };
    this.actions.push(entry);

    // 실시간 콘솔 출력
    const flag = this.getFlag(agentName);
    const icon = result === 'success' ? '✅' : '❌';
    console.log(`[${elapsed}] ${flag} ${agentName}: ${action} ${icon}`);
  }

  /**
   * 전쟁/조약 액션 로그에서 현재 전쟁/조약 수를 추정.
   * (글로벌 상태 API가 없으므로 액션 로그 기반 추적)
   */
  getWarTreatyStats(): { activeWars: number; activeTreaties: number } {
    let activeWars = 0;
    let activeTreaties = 0;

    for (const a of this.actions) {
      if (a.result !== 'success') continue;
      if (a.action.includes('declare_war')) activeWars++;
      if (a.action.includes('surrender') || a.action.includes('ceasefire')) activeWars = Math.max(0, activeWars - 1);
      if (a.action.includes('accept_treaty') || a.action.includes('propose_treaty')) activeTreaties++;
      if (a.action.includes('break_treaty')) activeTreaties = Math.max(0, activeTreaties - 1);
    }

    return { activeWars, activeTreaties };
  }

  logWorldState(ranking: GDPRanking[], observation: WorldObservation): void {
    const elapsed = this.formatElapsed();
    const snapshot: WorldSnapshot = {
      timestamp: Date.now(),
      elapsed,
      ranking: ranking.slice(0, 10),
      activeWars: observation.activeWars,
      activeTreaties: observation.activeTreaties,
      totalCountries: observation.totalCountries,
    };
    this.worldSnapshots.push(snapshot);

    // 실시간 콘솔 출력 — GDP Top 3 + 전쟁/조약 수
    const top3 = ranking.slice(0, 3).map((r, i) =>
      `#${i + 1} ${r.name}($${(r.gdp / 1000).toFixed(0)}K)`
    ).join(' | ');
    const gdpStr = top3 || 'No data';
    console.log(`[${elapsed}] 🌍 GDP: ${gdpStr} | Wars: ${observation.activeWars} | Treaties: ${observation.activeTreaties} | Countries: ${observation.totalCountries}`);
  }

  async generateReport(scenarioName: string, agentNames: string[]): Promise<string> {
    // 디렉토리 생성
    const dateStr = new Date().toISOString().slice(0, 10);
    const dir = join(this.logDir, `${dateStr}-${scenarioName}`);
    if (!existsSync(dir)) mkdirSync(dir, { recursive: true });

    // JSON 데이터 저장
    writeFileSync(join(dir, 'timeline.json'), JSON.stringify(this.actions, null, 2));
    writeFileSync(join(dir, 'gdp-history.json'), JSON.stringify(this.worldSnapshots, null, 2));

    // Markdown 리포트 생성
    const report = this.buildMarkdownReport(scenarioName, agentNames);
    writeFileSync(join(dir, 'report.md'), report);

    console.log(`\n📊 Report saved to: ${dir}/report.md`);
    return dir;
  }

  private buildMarkdownReport(scenarioName: string, agentNames: string[]): string {
    const duration = this.formatElapsed();
    const totalActions = this.actions.length;
    const successCount = this.actions.filter(a => a.result === 'success').length;
    const successRate = totalActions > 0
      ? (successCount / totalActions * 100).toFixed(1)
      : '0.0';

    // ─── 액션별 통계 (성공률 포함) ───
    const actionStats: Record<string, { total: number; success: number }> = {};
    for (const a of this.actions) {
      const name = a.action.split('(')[0];
      if (!actionStats[name]) actionStats[name] = { total: 0, success: 0 };
      actionStats[name].total++;
      if (a.result === 'success') actionStats[name].success++;
    }
    const sortedActions = Object.entries(actionStats)
      .sort((a, b) => b[1].total - a[1].total)
      .map(([name, s]) => {
        const rate = s.total > 0 ? (s.success / s.total * 100).toFixed(1) : '0.0';
        return `| ${name} | ${s.total} | ${s.success} | ${rate}% |`;
      })
      .join('\n');

    // ─── 최종 GDP Top 10 ───
    const lastSnapshot = this.worldSnapshots[this.worldSnapshots.length - 1];
    const finalRanking = lastSnapshot?.ranking ?? [];
    const rankingStr = finalRanking.slice(0, 10).map((r, i) =>
      `| ${i + 1} | ${r.name} | $${(r.gdp / 1000).toFixed(1)}K | ${r.growth_rate > 0 ? '+' : ''}${r.growth_rate.toFixed(1)}% |`
    ).join('\n');

    // ─── GDP 변화 추이 (틱별 Top 1 GDP 추적) ───
    const gdpTrend = this.buildGDPTrend();

    // ─── 주요 이벤트 (전쟁 선언, 조약 등) ───
    const keyEvents = this.actions
      .filter(a => ['declare_war', 'propose_treaty', 'accept_treaty', 'surrender', 'ceasefire', 'break_treaty'].some(k => a.action.includes(k)))
      .slice(0, 20)
      .map(a => `- [${a.elapsed}] ${a.agent}: ${a.action} ${a.result === 'success' ? '✅' : '❌'}`)
      .join('\n') || '- No major events';

    // ─── 에이전트별 활동 요약 ───
    const agentSummary = this.buildAgentSummary(agentNames);

    // ─── v16 vs v17 비교 ───
    const comparison = this.buildComparison(totalActions, successCount, actionStats);

    return `# Simulation Report: ${scenarioName}

## Overview
- **Duration**: ${duration}
- **Agents**: ${agentNames.length} (${agentNames.join(', ')})
- **Total Actions**: ${totalActions} (Success rate: ${successRate}%)
- **World Snapshots**: ${this.worldSnapshots.length}
- **Final Wars/Treaties**: ${lastSnapshot?.activeWars ?? 0} wars / ${lastSnapshot?.activeTreaties ?? 0} treaties

## Final GDP Rankings (Top 10)
| Rank | Faction | GDP | Growth |
|------|---------|-----|--------|
${rankingStr || '| - | No data | - | - |'}

## GDP Trend
${gdpTrend}

## Key Events
${keyEvents}

## Action Distribution (with Success Rate)
| Action | Total | Success | Rate |
|--------|-------|---------|------|
${sortedActions || '| - | 0 | 0 | 0% |'}

## Agent Activity Summary
${agentSummary}

## Pre/Post Comparison (v16 vs v17)
${comparison}

---
*Generated at ${new Date().toISOString()}*
`;
  }

  /**
   * GDP 변화 추이 — 각 스냅샷의 Top 1 GDP를 추적하여 트렌드 표시
   */
  private buildGDPTrend(): string {
    if (this.worldSnapshots.length === 0) {
      return '- No GDP data collected';
    }

    const hasAnyGDP = this.worldSnapshots.some(s => s.ranking.length > 0);
    if (!hasAnyGDP) {
      return '- GDP rankings were empty throughout the simulation';
    }

    // 최대 20개 포인트로 샘플링
    const snapshots = this.worldSnapshots;
    const step = Math.max(1, Math.floor(snapshots.length / 20));
    const sampled = snapshots.filter((_, i) => i % step === 0 || i === snapshots.length - 1);

    const lines = ['| Tick | Top 1 | GDP | Top 2 | GDP | Top 3 | GDP |', '|------|-------|-----|-------|-----|-------|-----|'];
    for (const s of sampled) {
      const r = s.ranking;
      const col = (idx: number) => r[idx] ? `${r[idx].name}` : '-';
      const gdp = (idx: number) => r[idx] ? `$${(r[idx].gdp / 1000).toFixed(1)}K` : '-';
      lines.push(`| ${s.elapsed} | ${col(0)} | ${gdp(0)} | ${col(1)} | ${gdp(1)} | ${col(2)} | ${gdp(2)} |`);
    }

    return lines.join('\n');
  }

  /**
   * 에이전트별 활동 요약 — 액션 타입별 성공/실패 상세
   */
  private buildAgentSummary(agentNames: string[]): string {
    return agentNames.map(name => {
      const agentActions = this.actions.filter(a => a.agent === name);
      const total = agentActions.length;
      const success = agentActions.filter(a => a.result === 'success').length;
      const fail = total - success;
      const rate = total > 0 ? (success / total * 100).toFixed(1) : '0.0';

      // 액션 타입별 분류
      const byType: Record<string, { s: number; f: number }> = {};
      for (const a of agentActions) {
        const t = a.action.split('(')[0];
        if (!byType[t]) byType[t] = { s: 0, f: 0 };
        if (a.result === 'success') byType[t].s++; else byType[t].f++;
      }
      const breakdown = Object.entries(byType)
        .sort((a, b) => (b[1].s + b[1].f) - (a[1].s + a[1].f))
        .map(([t, v]) => `${t}(${v.s}/${v.s + v.f})`)
        .join(', ');

      return `### ${this.getFlag(name)} ${name}
- **Total**: ${total} actions | **Success**: ${success} | **Fail**: ${fail} | **Rate**: ${rate}%
- **Breakdown**: ${breakdown || 'none'}`;
    }).join('\n\n');
  }

  /**
   * v16 vs v17 비교 — 하드코딩된 v16 baseline과 동적 v17 결과 비교
   */
  private buildComparison(
    totalActions: number,
    successCount: number,
    actionStats: Record<string, { total: number; success: number }>,
  ): string {
    const v17SuccessRate = totalActions > 0 ? (successCount / totalActions * 100) : 0;

    // 조약 수락률 계산
    const treatyAccepts = actionStats['accept_treaty'];
    const treatyProposals = actionStats['propose_treaty'];
    const v17TreatyAcceptRate = treatyProposals && treatyProposals.total > 0
      ? ((treatyAccepts?.success ?? 0) / treatyProposals.total * 100)
      : 0;

    // 거래 체결 확인
    const tradeActions = actionStats['place_order'] ?? actionStats['trade'] ?? { total: 0, success: 0 };
    const v17TradeStatus = tradeActions.total > 0
      ? `${tradeActions.success}/${tradeActions.total} executed (${(tradeActions.success / tradeActions.total * 100).toFixed(1)}%)`
      : 'no trade actions';

    // GDP 데이터 존재 여부
    const hasGDP = this.worldSnapshots.some(s => s.ranking.length > 0);

    // 서버 안정성 (스냅샷 수 기준)
    const expectedSnapshots = Math.floor((Date.now() - this.startTime) / 10_000); // 10초 간격 기대
    const actualSnapshots = this.worldSnapshots.length;
    const snapshotRate = expectedSnapshots > 0 ? (actualSnapshots / expectedSnapshots * 100) : 100;
    const v17Stability = snapshotRate > 90 ? 'stable' : snapshotRate > 50 ? 'partially stable' : 'unstable';

    const successDelta = v17SuccessRate - V16_BASELINE.successRate;
    const successIcon = successDelta >= 0 ? '📈' : '📉';

    return `| Metric | v16 (Baseline) | v17 (Current) | Delta |
|--------|----------------|---------------|-------|
| Success Rate | ${V16_BASELINE.successRate}% | ${v17SuccessRate.toFixed(1)}% | ${successIcon} ${successDelta > 0 ? '+' : ''}${successDelta.toFixed(1)}pp |
| Treaty Acceptance | ${V16_BASELINE.treatyAcceptance}% | ${v17TreatyAcceptRate.toFixed(1)}% | ${v17TreatyAcceptRate > 0 ? '📈 +' : ''}${v17TreatyAcceptRate.toFixed(1)}pp |
| Trade Execution | ${V16_BASELINE.tradeExecution} | ${v17TradeStatus} | ${tradeActions.success > 0 ? '📈 improved' : '—'} |
| GDP Data | ${V16_BASELINE.gdpDataAvailable ? 'available' : 'always empty'} | ${hasGDP ? 'available ✅' : 'still empty ❌'} | ${hasGDP ? '📈 fixed' : '— no change'} |
| Server Stability | ${V16_BASELINE.serverStability} | ${v17Stability} (${snapshotRate.toFixed(0)}% capture rate) | ${snapshotRate > 90 ? '📈 improved' : '—'} |`;
  }

  private formatElapsed(): string {
    const ms = Date.now() - this.startTime;
    const s = Math.floor(ms / 1000) % 60;
    const m = Math.floor(ms / 60_000) % 60;
    const h = Math.floor(ms / 3_600_000);
    return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
  }

  private getFlag(agentName: string): string {
    // 에이전트 이름에서 국가 코드 추출 시도 (예: "Korea-Claude" → KOR)
    for (const [code, flag] of Object.entries(FLAG_MAP)) {
      if (agentName.toUpperCase().includes(code)) return flag;
    }
    // 일반적인 국가명 매칭
    const nameMap: Record<string, string> = {
      korea: '🇰🇷', usa: '🇺🇸', japan: '🇯🇵', china: '🇨🇳', russia: '🇷🇺',
      germany: '🇩🇪', uk: '🇬🇧', france: '🇫🇷', brazil: '🇧🇷', india: '🇮🇳',
    };
    const lower = agentName.toLowerCase();
    for (const [name, flag] of Object.entries(nameMap)) {
      if (lower.includes(name)) return flag;
    }
    return '🏳️';
  }
}

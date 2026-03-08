/**
 * Prompt Builder — 게임 상태 → LLM 전략 프롬프트 변환
 */

import type {
  Faction,
  FactionDetail,
  Treaty,
  War,
  PolicySliders,
  GDPRanking,
  WorldEvent,
  SeasonInfo,
  WorldCountryStatus,
} from '../meta-types.js';

// 전략 상태 집약 (LLM 프롬프트 입력용)
export interface StrategicState {
  myFaction: FactionDetail;
  myFactionId: string;
  myCountryIso: string;
  myCountries: WorldCountryStatus[];
  myEconomy: {
    gdp: number;
    gdpRank: number;
    policies: PolicySliders;
  };
  treaties: Treaty[];
  activeWars: War[];
  worldRanking: GDPRanking[];
  recentEvents: WorldEvent[];
  season: SeasonInfo;
  memoryContext: string;
  tickNumber: number;
  completedTech: string[];
  pendingTreaties: Treaty[];
  allFactions: Faction[];
  intelOnCooldown: boolean;
  gdpGrowth?: string;
  strategyWarning?: string;
  techProgress?: Record<string, { invested: number; required: number }>;
}

export function buildStrategicPrompt(state: StrategicState): string {
  const myCountries = Array.isArray(state.myCountries) ? state.myCountries : [];
  const countriesStr = myCountries.map(c =>
    `${c.name}(${c.iso3}) GDP:$${fmt(c.gdp ?? 0)} Mil:${c.military_strength ?? 0}`
  ).join(', ') || 'None';

  const treatiesArr = Array.isArray(state.treaties) ? state.treaties : [];
  const treatiesStr = treatiesArr.map(t =>
    `${t.type} with ${t.proposer_faction_id === state.myFaction.id ? t.receiver_name : t.proposer_name} [${t.status}]`
  ).join(', ') || 'None';

  const warsArr = Array.isArray(state.activeWars) ? state.activeWars : [];
  const warsStr = warsArr.map(w => {
    const enemy = w.attacker_faction_id === state.myFaction.id ? w.defender_name : w.attacker_name;
    return `vs ${enemy} (${w.status})`;
  }).join(', ') || 'None';

  const rankingArr = Array.isArray(state.worldRanking) ? state.worldRanking : [];
  const rankingStr = rankingArr.slice(0, 8).map((r, i) =>
    `${i + 1}. ${r.name}: $${fmt(r.gdp ?? 0)} (${(r.growth_rate ?? 0) > 0 ? '+' : ''}${(r.growth_rate ?? 0).toFixed(1)}%)`
  ).join('\n') || 'No data';

  const eventsArr = Array.isArray(state.recentEvents) ? state.recentEvents : [];
  const eventsStr = eventsArr.slice(0, 5).map(e =>
    `- ${e.description}`
  ).join('\n') || '- No recent events';

  const p = state.myEconomy.policies;
  const warAllowed = state.season.current_era !== 'discovery';

  // 다른 팩션 ID 목록 (외교/전쟁 타겟용) — faction list에서 직접 가져옴 (자기 팩션 제외)
  const myId = state.myFactionId || state.myFaction.id;
  const factions = Array.isArray(state.allFactions) ? state.allFactions : [];
  const otherFactions = factions
    .filter(f => f.id && f.id !== myId)
    .map(f => `${f.name} [${f.tag}] id="${f.id}"`)
    .join('\n') || 'No other factions yet';

  // 인텔 쿨다운 상태
  const intelAvailable = !state.intelOnCooldown;
  // 인텔 타겟: 자국 제외
  const myIso = state.myCountryIso || state.myFaction.tag || '';
  const intelTargets = ['KOR','USA','CHN','RUS','DEU','JPN','GBR','FRA','BRA','IND'].filter(c => c !== myIso);

  // 기술 트리 상태 (완료/가능 노드 계산)
  const completed = Array.isArray(state.completedTech) ? state.completedTech : [];
  const allNodes = ['mil_1','mil_2','mil_3','mil_4','eco_1','eco_2','eco_3','eco_4','dip_1','dip_2','dip_3','dip_4'];
  const prereqs: Record<string, string> = {
    mil_2: 'mil_1', mil_3: 'mil_2', mil_4: 'mil_3',
    eco_2: 'eco_1', eco_3: 'eco_2', eco_4: 'eco_3',
    dip_2: 'dip_1', dip_3: 'dip_2', dip_4: 'dip_3',
  };
  const available = allNodes.filter(n => !completed.includes(n) && (!prereqs[n] || completed.includes(prereqs[n])));
  const completedStr = completed.length > 0 ? completed.join(', ') : 'None';
  const tp = state.techProgress;
  const availableStr = available.length > 0
    ? available.map(n => {
        if (tp && tp[n]) return `${n} (${tp[n].invested}/${tp[n].required} invested)`;
        return n;
      }).join(', ')
    : 'All completed';

  // 수락 대기 중인 조약
  const pendingArr = Array.isArray(state.pendingTreaties) ? state.pendingTreaties : [];
  const pendingStr = pendingArr.map(t => {
    const from = t.proposer_name || (t as any).faction_a || t.proposer_faction_id || 'unknown';
    return `[${t.id}] ${t.type} from ${from} → ACCEPT or REJECT`;
  }).join('\n') || '';

  return `## Current Situation (Tick #${state.tickNumber})

### My Faction: ${state.myFaction.name} [${state.myFaction.tag}] (${state.myFaction.member_count} members)
- Countries: ${countriesStr}
- GDP Rank: #${state.myEconomy.gdpRank} ($${fmt(state.myEconomy.gdp)})${state.gdpGrowth ? `\n- GDP Trend: ${state.gdpGrowth}` : ''}
- Policies: Tax=${p.tax_rate}% TradeOpen=${p.trade_openness}% Military=${p.military_spend}% Tech=${p.tech_invest}%
- Treasury: ${Object.entries(state.myFaction.treasury ?? {}).map(([k, v]) => `${k}=${v}`).join(', ') || 'Empty'}
- Tech Completed: ${completedStr}
- Tech Available: ${availableStr}

### Other Factions (use their ID for diplomacy/war)
${otherFactions}

### Diplomacy
- Treaties: ${treatiesStr}
- Wars: ${warsStr}
${pendingStr ? `\n### Pending Treaty Proposals (respond!)\n${pendingStr}` : ''}

### World Rankings (Top 8)
${rankingStr}

### Recent Events
${eventsStr}

### Season: ${state.season.name} — Era: ${state.season.current_era}
${warAllowed ? 'War is ALLOWED' : '⚠️ War is NOT allowed yet (Discovery era)'}

${state.memoryContext}

---

## Available Actions
Choose 2-3 MEANINGFUL actions. DO NOT use do_nothing unless you have a specific reason. Be proactive!

RULES:${state.strategyWarning ? `\n⚠️ STRATEGY DIVERSITY: ${state.strategyWarning}` : ''}
- Policy values are PERCENTAGES (0-100). Limits: tax_rate(0-50), trade_openness(0-100), military_spend(0-50), tech_invest(0-30)
- Tech invest: ONLY use exact node IDs from "Tech Available" above (e.g. mil_1, eco_2). NEVER invent names like "tech" or "tech_1".
- Trade: quantity >= 10, price 0.01-10000. Sell resources you have excess of, buy what you need.
- Diplomacy: Use faction IDs from "Other Factions" list ONLY. NEVER use your own faction ID (${myId.slice(0, 8)}...).
- Intel: target must be from: ${intelTargets.join(', ')}. NEVER target your own country (${myIso}).
${intelAvailable ? '- Intel is AVAILABLE (1 mission per hour).' : '- ⚠️ Intel is ON COOLDOWN. Do NOT use launch_intel this tick!'}
${warAllowed ? '- War: You CAN declare war. Consider it against rivals.' : '- War: NOT available yet (Discovery era).'}

Actions:
- {"action": "set_policy", "params": {"tax_rate": N, "trade_openness": N, "military_spend": N, "tech_invest": N}}
- {"action": "propose_treaty", "params": {"target": "FACTION_ID", "type": "non_aggression|trade_agreement|military_alliance"}}
- {"action": "accept_treaty", "params": {"treatyId": "xxx"}}
- {"action": "reject_treaty", "params": {"treatyId": "xxx"}}
- {"action": "declare_war", "params": {"target": "FACTION_ID"}}${!warAllowed ? ' [BLOCKED]' : ''}
- {"action": "place_trade_order", "params": {"resource": "oil|minerals|food|tech|manpower|influence", "side": "buy|sell", "quantity": N, "price": N}}
- {"action": "invest_tech", "params": {"node": "${available[0] ?? 'eco_1'}", "amount": N}}  (valid nodes: ${availableStr})
${intelAvailable ? `- {"action": "launch_intel", "params": {"type": "scout|sabotage|counter_intel", "target": "${intelTargets[0]}"}}` : '- launch_intel: UNAVAILABLE (cooldown)'}

Respond with ONLY a JSON array. Example: [{"action":"set_policy","params":{...}},{"action":"invest_tech","params":{...}}]`;
}

function fmt(n: number): string {
  if (n >= 1_000_000) return (n / 1_000_000).toFixed(1) + 'M';
  if (n >= 1_000) return (n / 1_000).toFixed(1) + 'K';
  return n.toString();
}

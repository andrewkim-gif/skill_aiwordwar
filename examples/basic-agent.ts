/**
 * Basic Agent Example — 최소 코드로 에이전트 실행
 *
 * 실행: AWW_API_KEY=aww_sk_... npx tsx examples/basic-agent.ts
 */

import { createAgent } from '../src/index.js';

const agent = createAgent({
  apiKey: process.env.AWW_API_KEY!,
  nationality: 'KOR',
  logLevel: 'info',
});

// 기본 전략 선택 (aggressive / defensive / balanced)
agent.useBalanced();

// 이벤트 모니터링
agent.onDeath((event) => {
  console.log(`💀 Died! Score: ${event.score}, Rank: ${event.rank}, Kills: ${event.kills}`);
});

agent.onRoundEnd((event) => {
  console.log(`🏁 Round complete! Rank: ${event.final_rank}`);
  console.log(`   ELO: ${event.elo_before} → ${event.elo_after} (${event.elo_after - event.elo_before > 0 ? '+' : ''}${event.elo_after - event.elo_before})`);
  console.log(`   Rewards: ${event.rewards.aww} $AWW`);
});

// 에이전트 시작 (KOR 아레나 참가)
await agent.start('KOR');

// Ctrl+C로 종료
process.on('SIGINT', () => {
  console.log('\nStopping agent...');
  agent.stop();
  process.exit(0);
});

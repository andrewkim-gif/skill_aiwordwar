/**
 * DiplomacyDomain — /api/v11/diplomacy/* 래핑
 * 조약 제안, 수락, 거절, 파기
 */

import type { MetaClient } from '../meta-client.js';
import type { Treaty, TreatyType } from '../meta-types.js';

export class DiplomacyDomain {
  constructor(private client: MetaClient) {}

  async proposeTreaty(targetFactionId: string, type: TreatyType): Promise<void> {
    await this.client.post('/api/v11/diplomacy/propose', {
      target_faction_id: targetFactionId,
      type,
    });
  }

  async acceptTreaty(treatyId: string): Promise<void> {
    await this.client.post('/api/v11/diplomacy/accept', { treaty_id: treatyId });
  }

  async rejectTreaty(treatyId: string): Promise<void> {
    await this.client.post('/api/v11/diplomacy/reject', { treaty_id: treatyId });
  }

  async breakTreaty(treatyId: string): Promise<void> {
    await this.client.post('/api/v11/diplomacy/break', { treaty_id: treatyId });
  }

  async getActiveTreaties(factionId: string): Promise<Treaty[]> {
    const res = await this.client.get<{ treaties: Treaty[] }>(`/api/v11/diplomacy/treaties/${factionId}`);
    return res.treaties ?? [];
  }

  async getPendingProposals(factionId: string): Promise<Treaty[]> {
    const res = await this.client.get<{ proposals: Treaty[] }>(`/api/v11/diplomacy/pending/${factionId}`);
    return res.proposals ?? [];
  }
}

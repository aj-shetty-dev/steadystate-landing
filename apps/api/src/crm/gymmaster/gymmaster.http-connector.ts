import {
  gymmasterMembersResponseSchema,
  gymmasterVisitsResponseSchema,
  type CrmMember,
  type CrmPageRequest,
  type CrmPageResult,
  type CrmProvider,
  type CrmVisit,
  type GymmasterCredentials,
} from '@steady-state/shared-types';
import { CrmConnectorError, type CrmConnector, type CrmConnectorVerifyResult } from '../connector.interface';
import { gymmasterMemberToCrmMember, gymmasterVisitToCrmVisit } from './gymmaster.mapper';

// GymMaster v1 API skeleton. Auth via API key in `api_key` query param.
// Confirm exact endpoints during onboarding.
export class GymmasterHttpConnector implements CrmConnector {
  readonly provider: CrmProvider = 'gymmaster';

  constructor(private readonly credentials: GymmasterCredentials) {}

  async verifyConnection(): Promise<CrmConnectorVerifyResult> {
    try {
      await this.request('/clubs');
      return { ok: true };
    } catch (err) {
      return { ok: false, message: (err as Error).message };
    }
  }

  async listMembers(page?: Partial<CrmPageRequest>): Promise<CrmPageResult<CrmMember>> {
    const params = this.baseParams(page);
    const data = await this.request(`/members?${params.toString()}`);
    const parsed = gymmasterMembersResponseSchema.parse(data);
    const next = parsed.offset + parsed.limit;
    return {
      items: parsed.members.map(gymmasterMemberToCrmMember),
      nextCursor: next < parsed.total ? String(next) : undefined,
    };
  }

  async listVisits(page?: Partial<CrmPageRequest>): Promise<CrmPageResult<CrmVisit>> {
    const params = this.baseParams(page);
    const data = await this.request(`/visits?${params.toString()}`);
    const parsed = gymmasterVisitsResponseSchema.parse(data);
    const next = parsed.offset + parsed.limit;
    return {
      items: parsed.visits.map(gymmasterVisitToCrmVisit),
      nextCursor: next < parsed.total ? String(next) : undefined,
    };
  }

  private baseParams(page?: Partial<CrmPageRequest>): URLSearchParams {
    const p = new URLSearchParams({
      api_key: this.credentials.apiKey,
      limit: String(page?.limit ?? 100),
    });
    if (page?.cursor) p.set('offset', page.cursor);
    if (page?.since) p.set('since', page.since.toISOString());
    return p;
  }

  private async request(path: string): Promise<unknown> {
    const res = await fetch(`${this.credentials.baseUrl}${path}`);
    if (res.status === 401 || res.status === 403) {
      throw new CrmConnectorError('gymmaster', 'auth', `GymMaster auth failed (${res.status})`);
    }
    if (res.status === 429) {
      throw new CrmConnectorError('gymmaster', 'rate_limit', 'GymMaster rate limit exceeded');
    }
    if (!res.ok) {
      throw new CrmConnectorError('gymmaster', 'transport', `GymMaster ${res.status}: ${await res.text()}`);
    }
    return res.json();
  }
}

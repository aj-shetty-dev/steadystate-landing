import {
  glofoxCheckinsResponseSchema,
  glofoxMembersResponseSchema,
  type CrmMember,
  type CrmPageRequest,
  type CrmPageResult,
  type CrmProvider,
  type CrmVisit,
  type GlofoxCredentials,
} from '@steady-state/shared-types';
import { CrmConnectorError, type CrmConnector, type CrmConnectorVerifyResult } from '../connector.interface';
import { glofoxCheckinToCrmVisit, glofoxMemberToCrmMember } from './glofox.mapper';

// Glofox partner API v2 skeleton. Auth is typically a bearer token derived from the partner API key.
// Confirm the exact base URL with Glofox when partnership is granted.
export class GlofoxHttpConnector implements CrmConnector {
  readonly provider: CrmProvider = 'glofox';
  private readonly baseUrl = 'https://api.glofox.com/v2';

  constructor(private readonly credentials: GlofoxCredentials) {}

  async verifyConnection(): Promise<CrmConnectorVerifyResult> {
    try {
      await this.request('/branches/self');
      return { ok: true };
    } catch (err) {
      return { ok: false, message: (err as Error).message };
    }
  }

  async listMembers(page?: Partial<CrmPageRequest>): Promise<CrmPageResult<CrmMember>> {
    const params = new URLSearchParams({ limit: String(page?.limit ?? 100) });
    if (page?.cursor) params.set('cursor', page.cursor);
    if (page?.since) params.set('updated_since', page.since.toISOString());
    const data = await this.request(`/branches/${this.credentials.branchId}/members?${params.toString()}`);
    const parsed = glofoxMembersResponseSchema.parse(data);
    return {
      items: parsed.data.map(glofoxMemberToCrmMember),
      nextCursor: parsed.next_cursor ?? undefined,
    };
  }

  async listVisits(page?: Partial<CrmPageRequest>): Promise<CrmPageResult<CrmVisit>> {
    const params = new URLSearchParams({ limit: String(page?.limit ?? 100) });
    if (page?.cursor) params.set('cursor', page.cursor);
    if (page?.since) params.set('since', page.since.toISOString());
    const data = await this.request(`/branches/${this.credentials.branchId}/checkins?${params.toString()}`);
    const parsed = glofoxCheckinsResponseSchema.parse(data);
    return {
      items: parsed.data.map(glofoxCheckinToCrmVisit),
      nextCursor: parsed.next_cursor ?? undefined,
    };
  }

  private async request(path: string): Promise<unknown> {
    const res = await fetch(`${this.baseUrl}${path}`, {
      headers: {
        Authorization: `Bearer ${this.credentials.apiKey}`,
        'Content-Type': 'application/json',
      },
    });
    if (res.status === 401 || res.status === 403) {
      throw new CrmConnectorError('glofox', 'auth', `Glofox auth failed (${res.status})`);
    }
    if (res.status === 429) {
      throw new CrmConnectorError('glofox', 'rate_limit', 'Glofox rate limit exceeded');
    }
    if (!res.ok) {
      throw new CrmConnectorError('glofox', 'transport', `Glofox ${res.status}: ${await res.text()}`);
    }
    return res.json();
  }
}

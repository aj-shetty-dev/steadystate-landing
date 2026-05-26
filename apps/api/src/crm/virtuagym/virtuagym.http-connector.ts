import {
  virtuagymMembersResponseSchema,
  virtuagymVisitsResponseSchema,
  type CrmMember,
  type CrmPageRequest,
  type CrmPageResult,
  type CrmProvider,
  type CrmVisit,
  type VirtuagymCredentials,
} from '@steady-state/shared-types';
import { CrmConnectorError, type CrmConnector, type CrmConnectorVerifyResult } from '../connector.interface';
import { virtuagymMemberToCrmMember, virtuagymVisitToCrmVisit } from './virtuagym.mapper';

// Virtuagym Pro API v0 skeleton. Auth: api_key + login_token in query params.
// Confirm exact endpoints/paths during partnership onboarding.
export class VirtuagymHttpConnector implements CrmConnector {
  readonly provider: CrmProvider = 'virtuagym';
  private readonly baseUrl = 'https://api.virtuagym.com/api/v0';

  constructor(private readonly credentials: VirtuagymCredentials) {}

  async verifyConnection(): Promise<CrmConnectorVerifyResult> {
    try {
      await this.request(`/club/${this.credentials.clubId}`);
      return { ok: true };
    } catch (err) {
      return { ok: false, message: (err as Error).message };
    }
  }

  async listMembers(page?: Partial<CrmPageRequest>): Promise<CrmPageResult<CrmMember>> {
    const params = this.baseParams(page);
    const data = await this.request(`/club/${this.credentials.clubId}/members?${params.toString()}`);
    const parsed = virtuagymMembersResponseSchema.parse(data);
    return {
      items: parsed.result.map(virtuagymMemberToCrmMember),
      nextCursor: parsed.next_page != null ? String(parsed.next_page) : undefined,
    };
  }

  async listVisits(page?: Partial<CrmPageRequest>): Promise<CrmPageResult<CrmVisit>> {
    const params = this.baseParams(page);
    const data = await this.request(`/club/${this.credentials.clubId}/visits?${params.toString()}`);
    const parsed = virtuagymVisitsResponseSchema.parse(data);
    return {
      items: parsed.result.map(virtuagymVisitToCrmVisit),
      nextCursor: parsed.next_page != null ? String(parsed.next_page) : undefined,
    };
  }

  private baseParams(page?: Partial<CrmPageRequest>): URLSearchParams {
    const p = new URLSearchParams({
      api_key: this.credentials.apiKey,
      login_token: this.credentials.loginToken,
    });
    if (page?.cursor) p.set('page', page.cursor);
    if (page?.since) p.set('updated_since', page.since.toISOString());
    return p;
  }

  private async request(path: string): Promise<unknown> {
    const res = await fetch(`${this.baseUrl}${path}`);
    if (res.status === 401 || res.status === 403) {
      throw new CrmConnectorError('virtuagym', 'auth', `Virtuagym auth failed (${res.status})`);
    }
    if (res.status === 429) {
      throw new CrmConnectorError('virtuagym', 'rate_limit', 'Virtuagym rate limit exceeded');
    }
    if (!res.ok) {
      throw new CrmConnectorError('virtuagym', 'transport', `Virtuagym ${res.status}: ${await res.text()}`);
    }
    return res.json();
  }
}

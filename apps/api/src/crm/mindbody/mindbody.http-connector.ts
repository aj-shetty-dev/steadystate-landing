import {
  mindbodyClientsResponseSchema,
  mindbodyVisitsResponseSchema,
  type CrmMember,
  type CrmPageRequest,
  type CrmPageResult,
  type CrmProvider,
  type CrmVisit,
  type MindbodyCredentials,
} from '@steady-state/shared-types';
import { CrmConnectorError, type CrmConnector, type CrmConnectorVerifyResult } from '../connector.interface';
import { mindbodyClientToMember, mindbodyVisitToCrmVisit } from './mindbody.mapper';

// HTTP skeleton against the Mindbody Public API v6.
// Real auth flow (token exchange via /usertoken/issue) is left as TODO(human) until
// we have real credentials — every call currently includes the headers Mindbody expects.
export class MindbodyHttpConnector implements CrmConnector {
  readonly provider: CrmProvider = 'mindbody';
  private readonly baseUrl = 'https://api.mindbodyonline.com/public/v6';

  constructor(private readonly credentials: MindbodyCredentials) {}

  async verifyConnection(): Promise<CrmConnectorVerifyResult> {
    try {
      await this.request('/site/sites');
      return { ok: true };
    } catch (err) {
      return { ok: false, message: (err as Error).message };
    }
  }

  async listMembers(page?: Partial<CrmPageRequest>): Promise<CrmPageResult<CrmMember>> {
    const limit = page?.limit ?? 100;
    const offset = page?.cursor ? Number.parseInt(page.cursor, 10) : 0;
    const params = new URLSearchParams({ limit: String(limit), offset: String(offset) });
    if (page?.since) params.set('LastModifiedDate', page.since.toISOString());
    const data = await this.request(`/client/clients?${params.toString()}`);
    const parsed = mindbodyClientsResponseSchema.parse(data);
    const items = parsed.Clients.map(mindbodyClientToMember);
    const total = parsed.PaginationResponse.TotalResults;
    const next = offset + limit;
    return { items, nextCursor: next < total ? String(next) : undefined };
  }

  async listVisits(page?: Partial<CrmPageRequest>): Promise<CrmPageResult<CrmVisit>> {
    const limit = page?.limit ?? 100;
    const offset = page?.cursor ? Number.parseInt(page.cursor, 10) : 0;
    const params = new URLSearchParams({ limit: String(limit), offset: String(offset) });
    if (page?.since) params.set('StartDate', page.since.toISOString());
    const data = await this.request(`/client/clientvisits?${params.toString()}`);
    const parsed = mindbodyVisitsResponseSchema.parse(data);
    const items = parsed.Visits.map(mindbodyVisitToCrmVisit);
    const total = parsed.PaginationResponse.TotalResults;
    const next = offset + limit;
    return { items, nextCursor: next < total ? String(next) : undefined };
  }

  private async request(path: string): Promise<unknown> {
    const url = `${this.baseUrl}${path}`;
    const res = await fetch(url, {
      headers: {
        'Api-Key': this.credentials.apiKey,
        SiteId: this.credentials.siteId,
        // TODO(human): exchange staffUsername/staffPassword for a bearer token via
        // POST /usertoken/issue, cache it, and attach Authorization here.
        'Content-Type': 'application/json',
      },
    });
    if (res.status === 401 || res.status === 403) {
      throw new CrmConnectorError('mindbody', 'auth', `Mindbody auth failed (${res.status})`);
    }
    if (res.status === 429) {
      throw new CrmConnectorError('mindbody', 'rate_limit', 'Mindbody rate limit exceeded');
    }
    if (!res.ok) {
      throw new CrmConnectorError('mindbody', 'transport', `Mindbody ${res.status}: ${await res.text()}`);
    }
    return res.json();
  }
}

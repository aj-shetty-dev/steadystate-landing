import {
  zenotiAppointmentsResponseSchema,
  zenotiGuestsResponseSchema,
  type CrmMember,
  type CrmPageRequest,
  type CrmPageResult,
  type CrmProvider,
  type CrmVisit,
  type ZenotiCredentials,
} from '@steady-state/shared-types';
import { CrmConnectorError, type CrmConnector, type CrmConnectorVerifyResult } from '../connector.interface';
import { zenotiAppointmentToCrmVisit, zenotiGuestToCrmMember } from './zenoti.mapper';

// Zenoti Public API skeleton (api.zenoti.com). Auth: `apikey <key>` header.
// Pagination is page/size based; we encode the next page index into nextCursor.
export class ZenotiHttpConnector implements CrmConnector {
  readonly provider: CrmProvider = 'zenoti';
  private readonly baseUrl = 'https://api.zenoti.com/v1';

  constructor(private readonly credentials: ZenotiCredentials) {}

  async verifyConnection(): Promise<CrmConnectorVerifyResult> {
    try {
      await this.request(`/centers/${this.credentials.centerId}`);
      return { ok: true };
    } catch (err) {
      return { ok: false, message: (err as Error).message };
    }
  }

  async listMembers(page?: Partial<CrmPageRequest>): Promise<CrmPageResult<CrmMember>> {
    const size = page?.limit ?? 100;
    const pageNum = page?.cursor ? Number.parseInt(page.cursor, 10) : 1;
    const params = new URLSearchParams({ size: String(size), page: String(pageNum) });
    if (page?.since) params.set('updated_since', page.since.toISOString());
    const data = await this.request(`/guests?center_id=${this.credentials.centerId}&${params.toString()}`);
    const parsed = zenotiGuestsResponseSchema.parse(data);
    const items = parsed.guests.map(zenotiGuestToCrmMember);
    const hasMore = pageNum * size < parsed.page_info.total;
    return { items, nextCursor: hasMore ? String(pageNum + 1) : undefined };
  }

  async listVisits(page?: Partial<CrmPageRequest>): Promise<CrmPageResult<CrmVisit>> {
    const size = page?.limit ?? 100;
    const pageNum = page?.cursor ? Number.parseInt(page.cursor, 10) : 1;
    const params = new URLSearchParams({ size: String(size), page: String(pageNum) });
    if (page?.since) params.set('start_date', page.since.toISOString());
    const data = await this.request(`/appointments?center_id=${this.credentials.centerId}&${params.toString()}`);
    const parsed = zenotiAppointmentsResponseSchema.parse(data);
    const items = parsed.appointments.map(zenotiAppointmentToCrmVisit);
    const hasMore = pageNum * size < parsed.page_info.total;
    return { items, nextCursor: hasMore ? String(pageNum + 1) : undefined };
  }

  private async request(path: string): Promise<unknown> {
    const res = await fetch(`${this.baseUrl}${path}`, {
      headers: {
        Authorization: `apikey ${this.credentials.apiKey}`,
        Accept: 'application/json',
      },
    });
    if (res.status === 401 || res.status === 403) {
      throw new CrmConnectorError('zenoti', 'auth', `Zenoti auth failed (${res.status})`);
    }
    if (res.status === 429) {
      throw new CrmConnectorError('zenoti', 'rate_limit', 'Zenoti rate limit exceeded');
    }
    if (!res.ok) {
      throw new CrmConnectorError('zenoti', 'transport', `Zenoti ${res.status}: ${await res.text()}`);
    }
    return res.json();
  }
}

import type { CrmMember, CrmPageRequest, CrmPageResult, CrmProvider, CrmVisit } from '@steady-state/shared-types';
import type { CrmConnector, CrmConnectorVerifyResult } from '../connector.interface';
import { gymmasterMemberFixtures, gymmasterVisitFixtures } from './gymmaster.fixtures';
import { gymmasterMemberToCrmMember, gymmasterVisitToCrmVisit } from './gymmaster.mapper';

function pageItems<T>(items: T[], page?: Partial<CrmPageRequest>): CrmPageResult<T> {
  const limit = page?.limit ?? 100;
  const offset = page?.cursor ? Number.parseInt(page.cursor, 10) : 0;
  const start = Number.isFinite(offset) && offset >= 0 ? offset : 0;
  const slice = items.slice(start, start + limit);
  const nextCursor = start + limit < items.length ? String(start + limit) : undefined;
  return { items: slice, nextCursor };
}

export class GymmasterFakeConnector implements CrmConnector {
  readonly provider: CrmProvider = 'gymmaster';

  async verifyConnection(): Promise<CrmConnectorVerifyResult> {
    return { ok: true, message: 'fake' };
  }

  async listMembers(page?: Partial<CrmPageRequest>): Promise<CrmPageResult<CrmMember>> {
    const mapped = gymmasterMemberFixtures.map(gymmasterMemberToCrmMember);
    const filtered = page?.since ? mapped.filter((m) => m.joinedAt >= (page.since as Date)) : mapped;
    return pageItems(filtered, page);
  }

  async listVisits(page?: Partial<CrmPageRequest>): Promise<CrmPageResult<CrmVisit>> {
    const mapped = gymmasterVisitFixtures.map(gymmasterVisitToCrmVisit);
    const filtered = page?.since ? mapped.filter((v) => v.occurredAt >= (page.since as Date)) : mapped;
    return pageItems(filtered, page);
  }
}

import type { CrmMember, CrmPageRequest, CrmPageResult, CrmProvider, CrmVisit } from '@steady-state/shared-types';

export interface CrmConnectorVerifyResult {
  ok: boolean;
  message?: string;
}

export interface CrmConnector {
  readonly provider: CrmProvider;
  verifyConnection(): Promise<CrmConnectorVerifyResult>;
  listMembers(page?: Partial<CrmPageRequest>): Promise<CrmPageResult<CrmMember>>;
  listVisits(page?: Partial<CrmPageRequest>): Promise<CrmPageResult<CrmVisit>>;
}

export class CrmConnectorError extends Error {
  constructor(
    public readonly provider: CrmProvider,
    public readonly code: 'auth' | 'rate_limit' | 'transport' | 'unknown',
    message: string,
    public readonly cause?: unknown,
  ) {
    super(`[${provider}/${code}] ${message}`);
    this.name = 'CrmConnectorError';
  }
}

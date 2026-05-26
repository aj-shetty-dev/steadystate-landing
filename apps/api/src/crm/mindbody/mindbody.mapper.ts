import type { CrmMember, CrmVisit, MindbodyClient, MindbodyVisit } from '@steady-state/shared-types';
import type { CrmMembershipStatus } from '@steady-state/shared-types';
import { toE164 } from '../crm.mapping';

function mapStatus(s: MindbodyClient['Status']): CrmMembershipStatus {
  switch (s) {
    case 'Active':
      return 'active';
    case 'Inactive':
      return 'expired';
    case 'Declined':
      return 'cancelled';
    case 'Non-Member':
      return 'pending';
    default:
      return 'pending';
  }
}

function expiryFromContracts(contracts: MindbodyClient['ActiveContracts']): Date | null {
  if (!contracts || contracts.length === 0) return null;
  const dates = contracts
    .map((c) => (c.EndDate ? new Date(c.EndDate) : null))
    .filter((d): d is Date => d !== null && !Number.isNaN(d.getTime()));
  if (dates.length === 0) return null;
  return new Date(Math.max(...dates.map((d) => d.getTime())));
}

export function mindbodyClientToMember(client: MindbodyClient): CrmMember {
  const fullName = [client.FirstName, client.LastName].filter(Boolean).join(' ').trim() || 'Unknown';
  return {
    externalId: client.Id,
    provider: 'mindbody',
    fullName,
    email: client.Email ?? null,
    phone: toE164(client.MobilePhone ?? client.HomePhone ?? null),
    membershipStatus: mapStatus(client.Status),
    membershipExpiresAt: expiryFromContracts(client.ActiveContracts),
    lastCheckinAt: null,
    joinedAt: new Date(client.CreationDate),
    raw: client,
  };
}

export function mindbodyVisitToCrmVisit(visit: MindbodyVisit): CrmVisit {
  return {
    externalId: String(visit.Id),
    provider: 'mindbody',
    memberExternalId: visit.ClientId,
    occurredAt: new Date(visit.StartDateTime),
    source: 'checkin',
    raw: visit,
  };
}

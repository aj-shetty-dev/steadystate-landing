import type { CrmMember, CrmVisit, GymmasterMember, GymmasterVisit, CrmMembershipStatus } from '@steady-state/shared-types';
import { toE164 } from '../crm.mapping';

function mapStatus(s: GymmasterMember['status']): CrmMembershipStatus {
  switch (s) {
    case 'Active':
      return 'active';
    case 'Suspended':
      return 'paused';
    case 'Cancelled':
      return 'cancelled';
    case 'Expired':
      return 'expired';
    case 'Pending':
      return 'pending';
  }
}

export function gymmasterMemberToCrmMember(m: GymmasterMember): CrmMember {
  const fullName = [m.firstname, m.surname].filter(Boolean).join(' ').trim() || 'Unknown';
  return {
    externalId: m.id,
    provider: 'gymmaster',
    fullName,
    email: m.email,
    phone: toE164(m.phone),
    membershipStatus: mapStatus(m.status),
    membershipExpiresAt: m.membershipExpiry ? new Date(m.membershipExpiry) : null,
    lastCheckinAt: m.lastVisit ? new Date(m.lastVisit) : null,
    joinedAt: new Date(m.joinDate),
    raw: m,
  };
}

export function gymmasterVisitToCrmVisit(v: GymmasterVisit): CrmVisit {
  return {
    externalId: v.visitId,
    provider: 'gymmaster',
    memberExternalId: v.memberId,
    occurredAt: new Date(v.visitDate),
    source: v.channel === 'door' ? 'access' : 'checkin',
    raw: v,
  };
}

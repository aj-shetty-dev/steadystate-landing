import type { CrmMember, CrmVisit, VirtuagymMember, VirtuagymVisit, CrmMembershipStatus } from '@steady-state/shared-types';
import { toE164 } from '../crm.mapping';

function mapStatus(s: VirtuagymMember['status']): CrmMembershipStatus {
  switch (s) {
    case 'active':
      return 'active';
    case 'inactive':
      return 'expired';
    case 'frozen':
      return 'paused';
    case 'pending':
      return 'pending';
  }
}

export function virtuagymMemberToCrmMember(m: VirtuagymMember): CrmMember {
  const fullName = [m.first_name, m.last_name].filter(Boolean).join(' ').trim() || 'Unknown';
  return {
    externalId: String(m.user_id),
    provider: 'virtuagym',
    fullName,
    email: m.email,
    phone: toE164(m.mobile),
    membershipStatus: mapStatus(m.status),
    membershipExpiresAt: m.membership_end ? new Date(m.membership_end) : null,
    lastCheckinAt: m.last_visit ? new Date(m.last_visit) : null,
    joinedAt: new Date(m.member_since),
    raw: m,
  };
}

export function virtuagymVisitToCrmVisit(v: VirtuagymVisit): CrmVisit {
  return {
    externalId: String(v.visit_id),
    provider: 'virtuagym',
    memberExternalId: String(v.user_id),
    occurredAt: new Date(v.timestamp),
    source: v.source === 'access_gate' ? 'access' : 'checkin',
    raw: v,
  };
}

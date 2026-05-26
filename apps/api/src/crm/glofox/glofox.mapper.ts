import type { CrmMember, CrmVisit, GlofoxCheckin, GlofoxMember } from '@steady-state/shared-types';
import type { CrmMembershipStatus } from '@steady-state/shared-types';
import { toE164 } from '../crm.mapping';

function mapStatus(s: GlofoxMember['membership_status']): CrmMembershipStatus {
  switch (s) {
    case 'active':
      return 'active';
    case 'paused':
      return 'paused';
    case 'cancelled':
      return 'cancelled';
    case 'expired':
      return 'expired';
    case 'pending':
      return 'pending';
  }
}

export function glofoxMemberToCrmMember(member: GlofoxMember): CrmMember {
  const fullName = [member.first_name, member.last_name].filter(Boolean).join(' ').trim() || 'Unknown';
  return {
    externalId: member.id,
    provider: 'glofox',
    fullName,
    email: member.email,
    phone: toE164(member.phone),
    membershipStatus: mapStatus(member.membership_status),
    membershipExpiresAt: member.membership_expires_at ? new Date(member.membership_expires_at) : null,
    lastCheckinAt: member.last_check_in_at ? new Date(member.last_check_in_at) : null,
    joinedAt: new Date(member.joined_at),
    raw: member,
  };
}

export function glofoxCheckinToCrmVisit(checkin: GlofoxCheckin): CrmVisit {
  return {
    externalId: checkin.id,
    provider: 'glofox',
    memberExternalId: checkin.member_id,
    occurredAt: new Date(checkin.occurred_at),
    source: checkin.source === 'access_control' ? 'access' : 'checkin',
    raw: checkin,
  };
}

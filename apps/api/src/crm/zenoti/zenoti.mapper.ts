import type {
  CrmMember,
  CrmMembershipStatus,
  CrmVisit,
  ZenotiAppointment,
  ZenotiGuest,
} from '@steady-state/shared-types';
import { toE164 } from '../crm.mapping';

function mapStatus(s: NonNullable<ZenotiGuest['membership']>['status']): CrmMembershipStatus {
  switch (s) {
    case 'Active':
      return 'active';
    case 'Expired':
      return 'expired';
    case 'Suspended':
      return 'paused';
    case 'Cancelled':
      return 'cancelled';
    case 'Pending':
    case null:
    default:
      return 'pending';
  }
}

export function zenotiGuestToCrmMember(guest: ZenotiGuest): CrmMember {
  const { first_name, last_name, email, mobile_phone } = guest.personal_info;
  const fullName = [first_name, last_name].filter(Boolean).join(' ').trim() || 'Unknown';
  const phoneRaw = mobile_phone?.number ?? null;
  const cc = mobile_phone?.country_code ? String(mobile_phone.country_code) : '971';
  return {
    externalId: guest.id,
    provider: 'zenoti',
    fullName,
    email,
    phone: toE164(phoneRaw, cc),
    membershipStatus: mapStatus(guest.membership?.status ?? null),
    membershipExpiresAt: guest.membership?.expiry_date ? new Date(guest.membership.expiry_date) : null,
    lastCheckinAt: guest.last_visit_date ? new Date(guest.last_visit_date) : null,
    joinedAt: new Date(guest.created_date),
    raw: guest,
  };
}

export function zenotiAppointmentToCrmVisit(appt: ZenotiAppointment): CrmVisit {
  return {
    externalId: appt.id,
    provider: 'zenoti',
    memberExternalId: appt.guest_id,
    occurredAt: new Date(appt.start_time),
    source: 'class',
    raw: appt,
  };
}

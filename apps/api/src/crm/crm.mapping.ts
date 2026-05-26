import { MembershipStatus, CrmProvider as PrismaCrmProvider } from '@prisma/client';
import type { CrmMembershipStatus, CrmProvider } from '@steady-state/shared-types';

export function toPrismaProvider(provider: CrmProvider): PrismaCrmProvider {
  const map: Record<CrmProvider, PrismaCrmProvider> = {
    mindbody: PrismaCrmProvider.MINDBODY,
    glofox: PrismaCrmProvider.GLOFOX,
    zenoti: PrismaCrmProvider.ZENOTI,
    virtuagym: PrismaCrmProvider.VIRTUAGYM,
    gymmaster: PrismaCrmProvider.GYMMASTER,
    simple_logic: PrismaCrmProvider.SIMPLE_LOGIC,
    elewix: PrismaCrmProvider.ELEWIX,
  };
  return map[provider];
}

export function fromPrismaProvider(provider: PrismaCrmProvider): CrmProvider {
  switch (provider) {
    case PrismaCrmProvider.MINDBODY:
      return 'mindbody';
    case PrismaCrmProvider.GLOFOX:
      return 'glofox';
    case PrismaCrmProvider.ZENOTI:
      return 'zenoti';
    case PrismaCrmProvider.VIRTUAGYM:
      return 'virtuagym';
    case PrismaCrmProvider.GYMMASTER:
      return 'gymmaster';
    case PrismaCrmProvider.SIMPLE_LOGIC:
      return 'simple_logic';
    case PrismaCrmProvider.ELEWIX:
      return 'elewix';
    case PrismaCrmProvider.NATIVE:
      throw new Error('NATIVE provider has no external CRM mapping');
  }
}

export function toPrismaMembershipStatus(status: CrmMembershipStatus): MembershipStatus {
  const map: Record<CrmMembershipStatus, MembershipStatus> = {
    active: MembershipStatus.ACTIVE,
    expired: MembershipStatus.EXPIRED,
    paused: MembershipStatus.PAUSED,
    cancelled: MembershipStatus.CANCELLED,
    pending: MembershipStatus.PENDING,
  };
  return map[status];
}

// UAE-aware E.164 normalisation. Falls back to null when input is unusable.
export function toE164(raw: string | null | undefined, defaultCountry = '971'): string | null {
  if (!raw) return null;
  const digits = raw.replace(/[^\d+]/g, '');
  if (!digits) return null;
  if (digits.startsWith('+')) {
    const clean = '+' + digits.slice(1).replace(/\D/g, '');
    return /^\+[1-9]\d{6,14}$/.test(clean) ? clean : null;
  }
  // Local UAE numbers: leading 0 → drop and prepend country code.
  const stripped = digits.replace(/^0+/, '');
  if (!stripped) return null;
  const candidate = `+${defaultCountry}${stripped}`;
  return /^\+[1-9]\d{6,14}$/.test(candidate) ? candidate : null;
}

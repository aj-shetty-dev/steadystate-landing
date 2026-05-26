import type { GlofoxCheckin, GlofoxMember } from '@steady-state/shared-types';

const baseDate = new Date('2025-06-01T08:00:00Z').getTime();
const day = 24 * 60 * 60 * 1000;

export const glofoxMemberFixtures: GlofoxMember[] = [
  {
    id: 'gx_2001',
    first_name: 'Hassan',
    last_name: 'Bin Zayed',
    email: 'hassan@example.ae',
    phone: '+971502223344',
    joined_at: new Date(baseDate - 90 * day).toISOString(),
    membership_status: 'active',
    membership_expires_at: new Date(baseDate + 30 * day).toISOString(),
    last_check_in_at: new Date(baseDate - 1 * day).toISOString(),
  },
  {
    id: 'gx_2002',
    first_name: 'Mariam',
    last_name: 'Al Awadhi',
    email: 'mariam@example.ae',
    phone: '0509998877',
    joined_at: new Date(baseDate - 30 * day).toISOString(),
    membership_status: 'paused',
    membership_expires_at: new Date(baseDate + 60 * day).toISOString(),
    last_check_in_at: new Date(baseDate - 10 * day).toISOString(),
  },
];

export const glofoxCheckinFixtures: GlofoxCheckin[] = [
  {
    id: 'gx_ck_9001',
    member_id: 'gx_2001',
    occurred_at: new Date(baseDate - 1 * day).toISOString(),
    source: 'app',
  },
  {
    id: 'gx_ck_9002',
    member_id: 'gx_2002',
    occurred_at: new Date(baseDate - 10 * day).toISOString(),
    source: 'access_control',
  },
];

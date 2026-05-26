import type { VirtuagymMember, VirtuagymVisit } from '@steady-state/shared-types';

const baseDate = new Date('2025-07-01T08:00:00Z').getTime();
const day = 24 * 60 * 60 * 1000;

export const virtuagymMemberFixtures: VirtuagymMember[] = [
  {
    user_id: 3001,
    first_name: 'Layla',
    last_name: 'Khoury',
    email: 'layla@example.ae',
    mobile: '+971501112233',
    member_since: new Date(baseDate - 120 * day).toISOString(),
    status: 'active',
    membership_end: new Date(baseDate + 30 * day).toISOString(),
    last_visit: new Date(baseDate - 2 * day).toISOString(),
  },
  {
    user_id: 3002,
    first_name: 'Tariq',
    last_name: 'Hassan',
    email: 'tariq@example.ae',
    mobile: '0507778899',
    member_since: new Date(baseDate - 200 * day).toISOString(),
    status: 'frozen',
    membership_end: new Date(baseDate + 60 * day).toISOString(),
    last_visit: new Date(baseDate - 15 * day).toISOString(),
  },
];

export const virtuagymVisitFixtures: VirtuagymVisit[] = [
  { visit_id: 90001, user_id: 3001, timestamp: new Date(baseDate - 2 * day).toISOString(), source: 'access_gate' },
  { visit_id: 90002, user_id: 3002, timestamp: new Date(baseDate - 15 * day).toISOString(), source: 'app' },
];

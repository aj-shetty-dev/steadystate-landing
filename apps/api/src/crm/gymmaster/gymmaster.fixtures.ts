import type { GymmasterMember, GymmasterVisit } from '@steady-state/shared-types';

const baseDate = new Date('2025-08-01T08:00:00Z').getTime();
const day = 24 * 60 * 60 * 1000;

export const gymmasterMemberFixtures: GymmasterMember[] = [
  {
    id: 'gm_4001',
    firstname: 'Noor',
    surname: 'Al Suwaidi',
    email: 'noor@example.ae',
    phone: '+971544445566',
    joinDate: new Date(baseDate - 200 * day).toISOString(),
    status: 'Active',
    membershipExpiry: new Date(baseDate + 90 * day).toISOString(),
    lastVisit: new Date(baseDate - 3 * day).toISOString(),
  },
  {
    id: 'gm_4002',
    firstname: 'Faisal',
    surname: 'Al Otaibi',
    email: 'faisal@example.ae',
    phone: '0561112233',
    joinDate: new Date(baseDate - 50 * day).toISOString(),
    status: 'Suspended',
    membershipExpiry: new Date(baseDate + 10 * day).toISOString(),
    lastVisit: new Date(baseDate - 20 * day).toISOString(),
  },
];

export const gymmasterVisitFixtures: GymmasterVisit[] = [
  { visitId: 'gm_v_8001', memberId: 'gm_4001', visitDate: new Date(baseDate - 3 * day).toISOString(), channel: 'door' },
  { visitId: 'gm_v_8002', memberId: 'gm_4002', visitDate: new Date(baseDate - 20 * day).toISOString(), channel: 'reception' },
];

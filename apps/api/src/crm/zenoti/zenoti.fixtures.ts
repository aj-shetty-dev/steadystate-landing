import type { ZenotiAppointment, ZenotiGuest } from '@steady-state/shared-types';

const baseDate = new Date('2025-06-01T08:00:00Z').getTime();
const day = 24 * 60 * 60 * 1000;

export const zenotiGuestFixtures: ZenotiGuest[] = [
  {
    id: 'zn_g_3001',
    code: 'G3001',
    personal_info: {
      first_name: 'Fatima',
      last_name: 'Al Hashimi',
      email: 'fatima@example.ae',
      mobile_phone: { country_code: 971, number: '501234567' },
    },
    created_date: new Date(baseDate - 120 * day).toISOString(),
    membership: { name: 'Wellness Gold', status: 'Active', expiry_date: new Date(baseDate + 45 * day).toISOString() },
    last_visit_date: new Date(baseDate - 3 * day).toISOString(),
  },
  {
    id: 'zn_g_3002',
    code: 'G3002',
    personal_info: {
      first_name: 'Yousef',
      last_name: 'Rahman',
      email: 'yousef@example.ae',
      mobile_phone: { country_code: 971, number: '508765432' },
    },
    created_date: new Date(baseDate - 14 * day).toISOString(),
    membership: { name: null, status: null, expiry_date: null },
    last_visit_date: null,
  },
];

export const zenotiAppointmentFixtures: ZenotiAppointment[] = [
  {
    id: 'zn_a_8001',
    guest_id: 'zn_g_3001',
    start_time: new Date(baseDate - 3 * day).toISOString(),
    end_time: new Date(baseDate - 3 * day + 60 * 60 * 1000).toISOString(),
    status: 'Completed',
  },
];

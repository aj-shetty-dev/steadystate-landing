import type { MindbodyClient, MindbodyVisit } from '@steady-state/shared-types';

const baseDate = new Date('2025-06-01T08:00:00Z').getTime();
const day = 24 * 60 * 60 * 1000;

export const mindbodyClientFixtures: MindbodyClient[] = [
  {
    Id: 'MB-1001',
    FirstName: 'Aisha',
    LastName: 'Al Mansoori',
    Email: 'aisha@example.ae',
    MobilePhone: '+971501112233',
    HomePhone: null,
    Status: 'Active',
    CreationDate: new Date(baseDate - 200 * day).toISOString(),
    ActiveContracts: [
      { Id: 1, ContractName: 'Annual Unlimited', EndDate: new Date(baseDate + 100 * day).toISOString() },
    ],
  },
  {
    Id: 'MB-1002',
    FirstName: 'Omar',
    LastName: 'Khalifa',
    Email: 'omar@example.ae',
    MobilePhone: '0524445566',
    HomePhone: null,
    Status: 'Active',
    CreationDate: new Date(baseDate - 60 * day).toISOString(),
    ActiveContracts: [
      { Id: 2, ContractName: 'Monthly Reformer', EndDate: new Date(baseDate + 20 * day).toISOString() },
    ],
  },
  {
    Id: 'MB-1003',
    FirstName: 'Layla',
    LastName: 'Saeed',
    Email: 'layla@example.ae',
    MobilePhone: '+971507778899',
    HomePhone: null,
    Status: 'Inactive',
    CreationDate: new Date(baseDate - 365 * day).toISOString(),
    ActiveContracts: [],
  },
];

export const mindbodyVisitFixtures: MindbodyVisit[] = [
  {
    Id: 50001,
    ClientId: 'MB-1001',
    StartDateTime: new Date(baseDate - 2 * day).toISOString(),
    EndDateTime: new Date(baseDate - 2 * day + 60 * 60 * 1000).toISOString(),
    SignedIn: true,
    Name: 'Reformer 60',
  },
  {
    Id: 50002,
    ClientId: 'MB-1002',
    StartDateTime: new Date(baseDate - 7 * day).toISOString(),
    EndDateTime: new Date(baseDate - 7 * day + 60 * 60 * 1000).toISOString(),
    SignedIn: true,
    Name: 'Mat Pilates',
  },
];

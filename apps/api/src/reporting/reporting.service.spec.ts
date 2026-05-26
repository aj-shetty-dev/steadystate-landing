import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ReportingService } from './reporting.service';

function makeStub() {
  return {
    sale: {
      aggregate: vi.fn(async () => ({ _sum: { subtotalAed: 9500, vatAed: 500, totalAed: 10000 }, _count: { _all: 4 } })),
      groupBy: vi.fn(async () => [
        { staffId: 's1', _sum: { totalAed: 7000 }, _count: { _all: 3 } },
        { staffId: 's2', _sum: { totalAed: 3000 }, _count: { _all: 1 } },
      ]),
    },
    invoice: {
      aggregate: vi.fn(async () => ({ _sum: { amountAed: 23000, vatAed: 2000 }, _count: { _all: 2 } })),
    },
    member: {
      count: vi.fn().mockResolvedValueOnce(5).mockResolvedValueOnce(2).mockResolvedValueOnce(120),
    },
    classSession: {
      findMany: vi.fn(async () => [
        {
          capacityOverride: null,
          classType: { id: 'ct1', nameEn: 'Yoga', capacity: 10 },
          bookings: [
            { id: 'b1', status: 'BOOKED' },
            { id: 'b2', status: 'CHECKED_IN' },
            { id: 'b3', status: 'CHECKED_IN' },
          ],
        },
        {
          capacityOverride: 5,
          classType: { id: 'ct1', nameEn: 'Yoga', capacity: 10 },
          bookings: [{ id: 'b4', status: 'BOOKED' }],
        },
      ]),
    },
    staff: {
      findMany: vi.fn(async () => [
        { id: 's1', fullName: 'Alice', role: 'TRAINER' },
        { id: 's2', fullName: 'Bob', role: 'FRONT_DESK' },
        { id: 's3', fullName: 'Cara', role: 'MANAGER' },
      ]),
    },
  };
}

describe('ReportingService', () => {
  let stub: ReturnType<typeof makeStub>;
  let svc: ReportingService;

  beforeEach(() => {
    stub = makeStub();
    svc = new ReportingService(stub as unknown as never);
  });

  it('revenue sums sales + invoices', async () => {
    const r = await svc.revenue('t1');
    expect(r.sales.totalAed).toBe(10000);
    expect(r.invoices.totalAed).toBe(25000);
    expect(r.grandTotalAed).toBe(35000);
  });

  it('memberGrowth returns net growth', async () => {
    const r = await svc.memberGrowth('t1');
    expect(r.newMembers).toBe(5);
    expect(r.churnedMembers).toBe(2);
    expect(r.netGrowth).toBe(3);
    expect(r.currentActive).toBe(120);
  });

  it('classUtilization aggregates by classType with rates', async () => {
    const r = await svc.classUtilization('t1');
    expect(r.classes).toHaveLength(1);
    const c = r.classes[0];
    expect(c.sessions).toBe(2);
    expect(c.capacity).toBe(15); // 10 + 5
    expect(c.booked).toBe(4);
    expect(c.checkedIn).toBe(2);
    expect(c.fillRate).toBeCloseTo(4 / 15);
    expect(c.attendanceRate).toBeCloseTo(0.5);
  });

  it('staffCommission joins sales totals to staff list', async () => {
    const r = await svc.staffCommission('t1');
    expect(r.staff).toHaveLength(3);
    expect(r.staff.find((s) => s.id === 's1')!.totalAed).toBe(7000);
    expect(r.staff.find((s) => s.id === 's3')!.totalAed).toBe(0);
  });
});

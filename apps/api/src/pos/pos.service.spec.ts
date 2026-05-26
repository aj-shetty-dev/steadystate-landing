import { SaleLineKind, SaleType } from '@prisma/client';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { PosService } from './pos.service';

interface ProductRow { id: string; tenantId: string; priceAed: number; vatRate: number; nameEn: string; active: boolean }
interface SaleRow { id: string; tenantId: string; type: SaleType; memberId: string | null; staffId: string | null; subtotalAed: number; vatAed: number; totalAed: number; lines: unknown[] }

function makeStub() {
  const products = new Map<string, ProductRow>();
  const members = new Map<string, { id: string; tenantId: string }>();
  const sales = new Map<string, SaleRow>();
  let seq = 0;

  const stub = {
    products, members, sales,
    product: {
      findFirst: vi.fn(async ({ where }: { where: { id: string; tenantId: string; active?: boolean } }) => {
        const p = products.get(where.id);
        if (!p || p.tenantId !== where.tenantId) return null;
        if (where.active && !p.active) return null;
        return p;
      }),
    },
    membershipPlan: { findFirst: vi.fn(async () => null) },
    classType: { findFirst: vi.fn(async () => null) },
    lead: { findFirst: vi.fn(async () => null) },
    staff: {
      findFirst: vi.fn(async ({ where }: { where: { id: string; tenantId: string; active?: boolean } }) => {
        if (where.id === 'staff-ok' && where.tenantId === 't1') return { id: 'staff-ok' };
        return null;
      }),
    },
    member: {
      findFirst: vi.fn(async ({ where }: { where: { id: string; tenantId: string } }) => {
        const m = members.get(where.id);
        if (!m || m.tenantId !== where.tenantId) return null;
        return m;
      }),
    },
    sale: {
      create: vi.fn(async ({ data }: { data: { tenantId: string; type: SaleType; memberId?: string; staffId?: string; subtotalAed: number; vatAed: number; totalAed: number; lines: { create: Array<{ kind: SaleLineKind; nameSnapshot: string; unitPriceAed: number; quantity: number; vatAed: number; totalAed: number }> } } }) => {
        seq += 1;
        const r: SaleRow = {
          id: `sale-${seq}`,
          tenantId: data.tenantId,
          type: data.type,
          memberId: data.memberId ?? null,
          staffId: data.staffId ?? null,
          subtotalAed: data.subtotalAed,
          vatAed: data.vatAed,
          totalAed: data.totalAed,
          lines: data.lines.create,
        };
        sales.set(r.id, r);
        return r;
      }),
      findFirst: vi.fn(async ({ where }: { where: { id: string; tenantId: string } }) => sales.get(where.id) ?? null),
      findMany: vi.fn(async () => [...sales.values()]),
      aggregate: vi.fn(async () => ({ _sum: { subtotalAed: 0, vatAed: 0, totalAed: 0 }, _count: { _all: 0 } })),
    },
  };
  return stub;
}

describe('PosService', () => {
  let stub: ReturnType<typeof makeStub>;
  let svc: PosService;

  beforeEach(() => {
    stub = makeStub();
    svc = new PosService(stub as unknown as never);
    stub.products.set('p1', { id: 'p1', tenantId: 't1', priceAed: 1000, vatRate: 5, nameEn: 'Whey', active: true });
    stub.members.set('m1', { id: 'm1', tenantId: 't1' });
  });

  it('creates a PRODUCT sale with VAT computed', async () => {
    const s = await svc.create('t1', {
      type: 'PRODUCT',
      memberId: 'm1',
      lines: [{ kind: 'PRODUCT', refId: 'p1', quantity: 2 }],
    });
    expect(s.subtotalAed).toBe(2000);
    expect(s.vatAed).toBe(100);
    expect(s.totalAed).toBe(2100);
    expect(s.lines).toHaveLength(1);
  });

  it('walk-in DAY_PASS requires explicit unitPriceAed', async () => {
    await expect(
      svc.create('t1', {
        type: 'DAY_PASS',
        lines: [{ kind: 'DAY_PASS', quantity: 1 }],
      }),
    ).rejects.toThrow();
  });

  it('accepts walk-in DAY_PASS with price and snapshot', async () => {
    const s = await svc.create('t1', {
      type: 'DAY_PASS',
      lines: [{ kind: 'DAY_PASS', quantity: 1, unitPriceAed: 5000, nameSnapshot: 'Day pass' }],
    });
    expect(s.totalAed).toBe(5250);
  });

  it('rejects unknown product', async () => {
    await expect(
      svc.create('t1', { type: 'PRODUCT', lines: [{ kind: 'PRODUCT', refId: 'nope', quantity: 1 }] }),
    ).rejects.toThrow();
  });

  it('rejects unknown member', async () => {
    await expect(
      svc.create('t1', { type: 'PRODUCT', memberId: 'ghost', lines: [{ kind: 'PRODUCT', refId: 'p1', quantity: 1 }] }),
    ).rejects.toThrow();
  });

  it('rejects sale with unknown/cross-tenant staffId', async () => {
    await expect(
      svc.create('t1', { type: 'PRODUCT', staffId: 'ghost', lines: [{ kind: 'PRODUCT', refId: 'p1', quantity: 1 }] }),
    ).rejects.toThrow(/staff/i);
  });

  it('accepts sale with a valid tenant-scoped staffId', async () => {
    const s = await svc.create('t1', { type: 'PRODUCT', staffId: 'staff-ok', lines: [{ kind: 'PRODUCT', refId: 'p1', quantity: 1 }] });
    expect(s.staffId).toBe('staff-ok');
  });

  it('creates a MEMBERSHIP_INITIATION sale from a plan ref', async () => {
    stub.membershipPlan.findFirst.mockResolvedValue({ id: 'plan1', tenantId: 't1', priceAed: 25000, nameEn: 'Gold', active: true });
    const s = await svc.create('t1', {
      type: 'MEMBERSHIP_INITIATION',
      lines: [{ kind: 'MEMBERSHIP', refId: 'plan1', quantity: 1 }],
    });
    expect(s.subtotalAed).toBe(25000);
    expect(s.vatAed).toBe(1250);
  });

  it('rejects MEMBERSHIP line with unknown plan', async () => {
    stub.membershipPlan.findFirst.mockResolvedValue(null);
    await expect(
      svc.create('t1', { type: 'MEMBERSHIP_INITIATION', lines: [{ kind: 'MEMBERSHIP', refId: 'no-plan', quantity: 1 }] }),
    ).rejects.toThrow(/Plan.*not available/);
  });

  it('creates a DROP_IN sale from a class type with drop-in price', async () => {
    stub.classType.findFirst.mockResolvedValue({ id: 'ct1', tenantId: 't1', dropInPriceAed: 7500, nameEn: 'Yoga' });
    const s = await svc.create('t1', {
      type: 'DROP_IN',
      lines: [{ kind: 'CLASS_DROPIN', refId: 'ct1', quantity: 1 }],
    });
    expect(s.subtotalAed).toBe(7500);
  });

  it('rejects DROP_IN when class has no drop-in price', async () => {
    stub.classType.findFirst.mockResolvedValue({ id: 'ct1', tenantId: 't1', dropInPriceAed: null, nameEn: 'Free' });
    await expect(
      svc.create('t1', { type: 'DROP_IN', lines: [{ kind: 'CLASS_DROPIN', refId: 'ct1', quantity: 1 }] }),
    ).rejects.toThrow(/no drop-in price/);
  });

  it('rejects CLASS_DROPIN line without refId', async () => {
    await expect(
      svc.create('t1', { type: 'DROP_IN', lines: [{ kind: 'CLASS_DROPIN', quantity: 1 }] }),
    ).rejects.toThrow();
  });

  it('rejects sale with empty lines array', async () => {
    await expect(svc.create('t1', { type: 'PRODUCT', lines: [] })).rejects.toThrow();
  });

  it('lists sales filtered by member', async () => {
    stub.sale.findMany.mockResolvedValue([]);
    await svc.list('t1', { memberId: 'm1' });
    expect(stub.sale.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ memberId: 'm1' }) }),
    );
  });

  it('lists sales filtered by staff and date range', async () => {
    const from = new Date('2026-01-01');
    const to = new Date('2026-01-31');
    stub.sale.findMany.mockResolvedValue([]);
    await svc.list('t1', { staffId: 'staff-ok', from, to });
    expect(stub.sale.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ staffId: 'staff-ok' }) }),
    );
  });

  it('get() returns a sale with lines', async () => {
    stub.sale.findFirst.mockResolvedValue({ id: 's1', tenantId: 't1', lines: [] });
    const s = await svc.get('t1', 's1');
    expect(s.id).toBe('s1');
  });

  it('get() throws NotFound for unknown sale', async () => {
    stub.sale.findFirst.mockResolvedValue(null);
    await expect(svc.get('t1', 'ghost')).rejects.toThrow('Sale not found');
  });

  it('dailyTotals aggregates paid sales for a date', async () => {
    stub.sale.aggregate.mockResolvedValue({ _sum: { subtotalAed: 5000, vatAed: 250, totalAed: 5250 }, _count: { _all: 3 } });
    const result = await svc.dailyTotals('t1', new Date('2026-05-26'));
    expect(stub.sale.aggregate).toHaveBeenCalled();
    expect(result._count._all).toBe(3);
  });

  it('rejects PRODUCT line without refId', async () => {
    await expect(
      svc.create('t1', { type: 'PRODUCT', lines: [{ kind: 'PRODUCT', quantity: 1 }] }),
    ).rejects.toThrow(/refId/);
  });
});

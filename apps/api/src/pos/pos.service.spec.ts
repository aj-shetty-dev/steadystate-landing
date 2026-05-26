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
});

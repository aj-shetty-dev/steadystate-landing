import { OrderStatus } from '@prisma/client';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ShopService } from './shop.service';

interface ProductRow {
  id: string;
  tenantId: string;
  sku: string;
  priceAed: number;
  vatRate: number;
  active: boolean;
  nameEn: string;
}

function makeStub() {
  const products = new Map<string, ProductRow>();
  const members = new Map<string, { id: string; tenantId: string }>();
  const orders: Array<{ id: string; lines: Array<Record<string, unknown>> }> = [];
  let seq = 0;

  return {
    state: { products, members, orders },
    prisma: {
      product: {
        findMany: vi.fn(async (args: { where: { tenantId: string; id?: { in: string[] }; active?: boolean } }) => {
          const all = [...products.values()].filter((p) => p.tenantId === args.where.tenantId);
          let filtered = all;
          if (args.where.id?.in) filtered = filtered.filter((p) => args.where.id!.in.includes(p.id));
          if (args.where.active === true) filtered = filtered.filter((p) => p.active);
          return filtered;
        }),
        findUnique: vi.fn(async (args: { where: { tenantId_sku: { tenantId: string; sku: string } } }) => {
          const key = args.where.tenantId_sku;
          return [...products.values()].find((p) => p.tenantId === key.tenantId && p.sku === key.sku) ?? null;
        }),
        findFirst: vi.fn(async (args: { where: { id: string; tenantId: string } }) => {
          const p = products.get(args.where.id);
          return p && p.tenantId === args.where.tenantId ? p : null;
        }),
        create: vi.fn(async (args: { data: Record<string, unknown> }) => {
          const id = `p${++seq}`;
          const row = { id, ...args.data } as unknown as ProductRow;
          products.set(id, row);
          return row;
        }),
        update: vi.fn(async (args: { where: { id: string }; data: Record<string, unknown> }) => {
          const p = products.get(args.where.id);
          if (!p) throw new Error('not found');
          Object.assign(p, args.data);
          return p;
        }),
      },
      member: {
        findFirst: vi.fn(async (args: { where: { id: string; tenantId: string } }) => {
          const m = members.get(args.where.id);
          return m && m.tenantId === args.where.tenantId ? m : null;
        }),
      },
      order: {
        create: vi.fn(async (args: { data: Record<string, unknown> & { lines: { create: Array<Record<string, unknown>> } } }) => {
          const id = `o${++seq}`;
          const lines = args.data.lines.create.map((l, i) => ({ id: `${id}-${i}`, ...l }));
          const order = { id, ...args.data, lines };
          orders.push(order);
          return order;
        }),
        findMany: vi.fn(async () => orders),
        count: vi.fn(async () => orders.length),
        findFirst: vi.fn(async (args: { where: { id: string; tenantId: string } }) =>
          orders.find((o) => (o as unknown as { id: string }).id === args.where.id) ?? null,
        ),
        update: vi.fn(async (args: { where: { id: string }; data: Record<string, unknown> }) => {
          const o = orders.find((x) => x.id === args.where.id);
          if (!o) throw new Error('not found');
          Object.assign(o, args.data);
          return o;
        }),
      },
      $transaction: vi.fn(async (ops: unknown) => {
        if (Array.isArray(ops)) return Promise.all(ops);
        throw new Error('unsupported');
      }),
    },
  };
}

describe('ShopService', () => {
  let stub: ReturnType<typeof makeStub>;
  let service: ShopService;

  beforeEach(() => {
    stub = makeStub();
    service = new ShopService(stub.prisma as never);
  });

  it('creates a product', async () => {
    const created = await service.createProduct('t1', {
      sku: 'WHEY-1KG',
      nameEn: 'Whey 1kg',
      priceAed: 12000,
    });
    expect(created.sku).toBe('WHEY-1KG');
    expect(stub.state.products.size).toBe(1);
  });

  it('rejects duplicate SKU per tenant', async () => {
    await service.createProduct('t1', { sku: 'X', nameEn: 'X', priceAed: 100 });
    await expect(service.createProduct('t1', { sku: 'X', nameEn: 'X2', priceAed: 200 })).rejects.toThrow();
  });

  it('places an order computing VAT', async () => {
    stub.state.members.set('m1', { id: 'm1', tenantId: 't1' });
    const p = await service.createProduct('t1', { sku: 'P1', nameEn: 'P1', priceAed: 10000, vatRate: 5 });
    const order = await service.placeOrder('t1', {
      memberId: 'm1',
      lines: [{ productId: p.id, quantity: 2 }],
    });
    expect(order.subtotalAed).toBe(20000);
    expect(order.vatAed).toBe(1000);
    expect(order.totalAed).toBe(21000);
    expect(order.status).toBe(OrderStatus.PENDING);
  });

  it('rejects order with inactive product', async () => {
    stub.state.members.set('m1', { id: 'm1', tenantId: 't1' });
    const p = await service.createProduct('t1', { sku: 'P1', nameEn: 'P1', priceAed: 10000, active: false });
    await expect(
      service.placeOrder('t1', { memberId: 'm1', lines: [{ productId: p.id, quantity: 1 }] }),
    ).rejects.toThrow();
  });

  it('rejects order for member from other tenant', async () => {
    stub.state.members.set('m1', { id: 'm1', tenantId: 'other' });
    const p = await service.createProduct('t1', { sku: 'P1', nameEn: 'P1', priceAed: 10000 });
    await expect(
      service.placeOrder('t1', { memberId: 'm1', lines: [{ productId: p.id, quantity: 1 }] }),
    ).rejects.toThrow();
  });

  it('rejects marking a non-PENDING order as paid', async () => {
    stub.state.members.set('m1', { id: 'm1', tenantId: 't1' });
    const p = await service.createProduct('t1', { sku: 'P1', nameEn: 'P1', priceAed: 10000 });
    const order = await service.placeOrder('t1', { memberId: 'm1', lines: [{ productId: p.id, quantity: 1 }] });
    await service.markOrderPaid('t1', order.id);
    await expect(service.markOrderPaid('t1', order.id)).rejects.toThrow(/PAID|PENDING/);
  });

  it('rejects updateProduct when new sku collides with another product', async () => {
    const a = await service.createProduct('t1', { sku: 'A', nameEn: 'A', priceAed: 100 });
    await service.createProduct('t1', { sku: 'B', nameEn: 'B', priceAed: 100 });
    await expect(service.updateProduct('t1', a.id, { sku: 'B' })).rejects.toThrow(/SKU/);
  });

  it('allows updateProduct keeping its own sku', async () => {
    const a = await service.createProduct('t1', { sku: 'A', nameEn: 'A', priceAed: 100 });
    const updated = await service.updateProduct('t1', a.id, { sku: 'A', priceAed: 200 });
    expect((updated as { priceAed: number }).priceAed).toBe(200);
  });

  it('deactivates a product via active: false', async () => {
    const p = await service.createProduct('t1', { sku: 'DEACT', nameEn: 'Deactivate Me', priceAed: 100, active: true });
    await service.updateProduct('t1', p.id, { active: false });
    // Verify product is deactivated by trying to place an order — should reject
    stub.state.members.set('m1', { id: 'm1', tenantId: 't1' });
    await expect(
      service.placeOrder('t1', { memberId: 'm1', lines: [{ productId: p.id, quantity: 1 }] }),
    ).rejects.toThrow(/unavailable/);
  });

  it('updates product non-SKU fields (nameEn, description, price)', async () => {
    const p = await service.createProduct('t1', { sku: 'EDIT', nameEn: 'Original', priceAed: 100 });
    const updated = await service.updateProduct('t1', p.id, { nameEn: 'Updated', priceAed: 150 });
    expect((updated as { nameEn: string; priceAed: number }).nameEn).toBe('Updated');
    expect((updated as { nameEn: string; priceAed: number }).priceAed).toBe(150);
  });

  it('listProducts with activeOnly=true excludes inactive', async () => {
    await service.createProduct('t1', { sku: 'ACTIVE', nameEn: 'Active', priceAed: 100, active: true });
    const inactive = await service.createProduct('t1', { sku: 'INACTIVE', nameEn: 'Inactive', priceAed: 100, active: false });
    const list = await service.listProducts('t1', true);
    expect(list.every((p) => p.active)).toBe(true);
  });

  it('listProducts with activeOnly=false includes all', async () => {
    await service.createProduct('t1', { sku: 'ACTIVE2', nameEn: 'Active', priceAed: 100, active: true });
    await service.createProduct('t1', { sku: 'INACTIVE2', nameEn: 'Inactive', priceAed: 100, active: false });
    const list = await service.listProducts('t1', false);
    expect(list.some((p) => !p.active)).toBe(true);
  });

  it('updateProduct throws NotFound for unknown product', async () => {
    await expect(service.updateProduct('t1', 'ghost', { nameEn: 'X' })).rejects.toThrow('Product not found');
  });

  it('listOrders returns paginated results', async () => {
    stub.state.members.set('m1', { id: 'm1', tenantId: 't1' });
    const p = await service.createProduct('t1', { sku: 'P1', nameEn: 'P1', priceAed: 100 });
    await service.placeOrder('t1', { memberId: 'm1', lines: [{ productId: p.id, quantity: 1 }] });
    const result = await service.listOrders('t1', 1, 10);
    expect(result.items).toHaveLength(1);
    expect(result.total).toBe(1);
  });

  it('rejects order with non-existent member', async () => {
    const p = await service.createProduct('t1', { sku: 'P1', nameEn: 'P1', priceAed: 100 });
    await expect(
      service.placeOrder('t1', { memberId: 'no-member', lines: [{ productId: p.id, quantity: 1 }] }),
    ).rejects.toThrow('Member not found');
  });

  it('rejects order with no lines', async () => {
    await expect(
      service.placeOrder('t1', { memberId: 'm1', lines: [] }),
    ).rejects.toThrow();
  });

  it('markOrderPaid throws NotFound for unknown order', async () => {
    stub.prisma.order.findFirst.mockResolvedValue(null);
    await expect(service.markOrderPaid('t1', 'ghost')).rejects.toThrow('Order not found');
  });
});

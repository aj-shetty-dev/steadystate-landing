/**
 * POS Sales API — Integration Tests
 *
 * Covers: POST /api/pos/sales (create), GET /api/pos/sales (list)
 * Critical untested business path: selling products, drop-ins, memberships
 */
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { MOCK_USER, createReq, jsonBody } from './test-helpers';

const mockPrisma = {
  sale: {
    findMany: vi.fn(),
    create: vi.fn(),
    findUnique: vi.fn(),
  },
  product: {
    findFirst: vi.fn(),
  },
  membershipPlan: {
    findFirst: vi.fn(),
  },
  classType: {
    findFirst: vi.fn(),
  },
  member: {
    findFirst: vi.fn(),
  },
  staff: {
    findFirst: vi.fn(),
  },
  lead: {
    findFirst: vi.fn(),
  },
};

vi.mock('@/lib/prisma', () => ({ prisma: mockPrisma }));
vi.mock('@/lib/auth-server', () => ({
  requireServerUser: vi.fn().mockResolvedValue({
    id: 'user-1',
    email: 'owner@testgym.ae',
    fullName: 'Test Owner',
    tenantId: 'tenant-1',
    role: 'OWNER',
  }),
  requireTenantId: vi.fn().mockResolvedValue('tenant-1'),
}));

const posHandlers = await import('../../api/pos/sales/route');

describe('POS Sales — Create', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('POST /api/pos/sales — creates a product sale with valid line', async () => {
    mockPrisma.product.findFirst.mockResolvedValue({
      id: 'prod-1',
      nameEn: 'Protein Shake',
      priceAed: 2500, // 25 AED in fils
      vatRate: 5,
      active: true,
      tenantId: MOCK_USER.tenantId,
    });

    mockPrisma.sale.create.mockResolvedValue({
      id: 'sale-1',
      tenantId: MOCK_USER.tenantId,
      type: 'PRODUCT',
      memberId: null,
      subtotalAed: 2500,
      vatAed: 125,
      totalAed: 2625,
      lines: [
        {
          id: 'line-1',
          kind: 'PRODUCT',
          refId: 'prod-1',
          nameSnapshot: 'Protein Shake',
          quantity: 1,
          unitPriceAed: 2500,
          vatRate: 5,
          vatAed: 125,
          totalAed: 2625,
        },
      ],
    });

    const req = createReq({
      method: 'POST',
      body: {
        type: 'PRODUCT',
        lines: [
          {
            kind: 'PRODUCT',
            refId: 'prod-1',
            quantity: 1,
          },
        ],
      },
    });

    const res = await posHandlers.POST(req as any);
    const body: any = await jsonBody(res);

    expect(res.status).toBe(201);
    expect(body.totalAed).toBe(2625);
    expect(body.lines[0].nameSnapshot).toBe('Protein Shake');
  });

  it('POST /api/pos/sales — returns 400 with fieldErrors when no lines', async () => {
    const req = createReq({
      method: 'POST',
      body: {
        type: 'PRODUCT',
        lines: [],
      },
    });

    const res = await posHandlers.POST(req as any);
    const body = await jsonBody(res);
    expect(res.status).toBe(400);
    expect(body.fieldErrors).toBeDefined();
  });

  it('POST /api/pos/sales — rejects product line without refId', async () => {
    const req = createReq({
      method: 'POST',
      body: {
        type: 'PRODUCT',
        lines: [
          {
            kind: 'PRODUCT',
            quantity: 1,
          },
        ],
      },
    });

    const res = await posHandlers.POST(req as any);
    expect(res.status).toBe(400);
  });

  it('POST /api/pos/sales — rejects when product not found', async () => {
    mockPrisma.product.findFirst.mockResolvedValue(null);

    const req = createReq({
      method: 'POST',
      body: {
        type: 'PRODUCT',
        lines: [
          {
            kind: 'PRODUCT',
            refId: 'nonexistent',
            quantity: 1,
          },
        ],
      },
    });

    const res = await posHandlers.POST(req as any);
    expect(res.status).toBe(400);
  });

  it('POST /api/pos/sales — rejects invalid member reference', async () => {
    mockPrisma.product.findFirst.mockResolvedValue({
      id: 'prod-1',
      nameEn: 'Shake',
      priceAed: 1000,
      vatRate: 5,
      active: true,
      tenantId: MOCK_USER.tenantId,
    });
    mockPrisma.member.findFirst.mockResolvedValue(null);

    const req = createReq({
      method: 'POST',
      body: {
        type: 'PRODUCT',
        memberId: 'bad-member',
        lines: [
          {
            kind: 'PRODUCT',
            refId: 'prod-1',
            quantity: 1,
          },
        ],
      },
    });

    const res = await posHandlers.POST(req as any);
    expect(res.status).toBe(400);
    const body: any = await jsonBody(res);
    expect(body.message).toBe('Member not found');
  });
});

describe('POS Sales — List', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('GET /api/pos/sales — returns empty array when no sales', async () => {
    mockPrisma.sale.findMany.mockResolvedValue([]);

    const req = createReq();
    const res = await posHandlers.GET(req as any);
    const body: any = await jsonBody(res);

    expect(res.status).toBe(200);
    expect(body).toEqual([]);
  });

  it('GET /api/pos/sales — returns sales with member info', async () => {
    mockPrisma.sale.findMany.mockResolvedValue([
      {
        id: 'sale-1',
        type: 'PRODUCT',
        memberId: 'mem-1',
        subtotalAed: 10000,
        vatAed: 500,
        totalAed: 10500,
        createdAt: new Date(),
        lines: [],
        member: { id: 'mem-1', fullName: 'Ahmed', email: null, phone: null },
        staff: null,
      },
    ]);

    const req = createReq();
    const res = await posHandlers.GET(req as any);
    const body: any = await jsonBody(res);

    expect(res.status).toBe(200);
    expect(body).toHaveLength(1);
    expect(body[0].member.fullName).toBe('Ahmed');
  });

  it('GET /api/pos/sales — filters by memberId', async () => {
    mockPrisma.sale.findMany.mockResolvedValue([]);

    const req = createReq({ searchParams: { memberId: 'mem-1' } });
    await posHandlers.GET(req as any);

    const callArgs = mockPrisma.sale.findMany.mock.calls[0][0];
    expect(callArgs.where.memberId).toBe('mem-1');
  });
});

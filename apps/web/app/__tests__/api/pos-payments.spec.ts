/**
 * Phase 2 — POS Payments API Tests
 *
 * Covers: pay, refund, get single sale, daily reports
 * Critical P0 revenue paths — previously 0% coverage
 */
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { MOCK_USER, createReq, jsonBody } from './test-helpers';

const mockPrisma = {
  sale: {
    findFirst: vi.fn(),
    findMany: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
    aggregate: vi.fn(),
  },
  $transaction: vi.fn((arg: any) => {
    if (Array.isArray(arg)) return Promise.all(arg);
    return arg(mockPrisma);
  }),
};

vi.mock('@/lib/prisma', () => ({ prisma: mockPrisma }));
vi.mock('@/lib/auth-server', () => ({
  requireServerUser: vi.fn().mockResolvedValue(MOCK_USER),
  requireTenantId: vi.fn().mockResolvedValue(MOCK_USER.tenantId),
}));

// Mock Stripe for refunds
vi.mock('stripe', () => ({
  default: vi.fn().mockImplementation(() => ({
    refunds: {
      create: vi.fn().mockResolvedValue({ id: 're_stripe_123', status: 'succeeded' }),
    },
  })),
}));

const payHandlers = await import('../../api/pos/sales/[id]/pay/route');
const refundHandlers = await import('../../api/pos/sales/[id]/refund/route');
const getOneHandlers = await import('../../api/pos/sales/[id]/route');
const dailyHandlers = await import('../../api/pos/sales/reports/daily/route');

function params(id: string) {
  return { params: Promise.resolve({ id }) };
}

const SAMPLE_SALE = {
  id: 'sale-1',
  tenantId: MOCK_USER.tenantId,
  type: 'PRODUCT',
  memberId: 'mem-1',
  subtotalAed: 2500,
  vatAed: 125,
  totalAed: 2625,
  refundedAed: 0,
  paymentStatus: 'PENDING',
  stripePaymentIntentId: 'pi_test_123',
  currency: 'AED',
  createdAt: new Date(),
};

// ── Pay ──────────────────────────────────────────────────────────────────
describe('POST /api/pos/sales/[id]/pay', () => {
  beforeEach(() => vi.clearAllMocks());

  it('marks a PENDING sale as PAID', async () => {
    mockPrisma.sale.findFirst.mockResolvedValue({ id: 'sale-1', paymentStatus: 'PENDING' });
    mockPrisma.sale.update.mockResolvedValue({ ...SAMPLE_SALE, paymentStatus: 'PAID', lines: [] });

    const req = createReq({ method: 'POST' });
    const res = await payHandlers.POST(req as any, params('sale-1'));

    expect(res.status).toBe(200);
  });

  it('returns 404 when sale not found', async () => {
    mockPrisma.sale.findFirst.mockResolvedValue(null);
    const req = createReq({ method: 'POST' });
    const res = await payHandlers.POST(req as any, params('ghost'));
    expect(res.status).toBe(404);
  });

  it('returns 400 when sale is already PAID', async () => {
    mockPrisma.sale.findFirst.mockResolvedValue({ id: 'sale-1', paymentStatus: 'PAID' });
    const req = createReq({ method: 'POST' });
    const res = await payHandlers.POST(req as any, params('sale-1'));
    expect(res.status).toBe(400);
  });
});

// ── Refund ───────────────────────────────────────────────────────────────
describe('POST /api/pos/sales/[id]/refund', () => {
  beforeEach(() => vi.clearAllMocks());

  it('refunds a PAID sale', async () => {
    mockPrisma.sale.findFirst.mockResolvedValue({ ...SAMPLE_SALE, paymentStatus: 'PAID' });
    mockPrisma.sale.update.mockResolvedValue({});

    const req = createReq({ method: 'POST', body: { amountAed: 1000 } });
    const res = await refundHandlers.POST(req as any, params('sale-1'));

    expect(res.status).toBe(200);
    const body: any = await jsonBody(res);
    expect(body.refundId).toBeDefined();
    expect(body.status).toBe('succeeded');
  });

  it('returns 404 when sale not found', async () => {
    mockPrisma.sale.findFirst.mockResolvedValue(null);
    const req = createReq({ method: 'POST' });
    const res = await refundHandlers.POST(req as any, params('ghost'));
    expect(res.status).toBe(404);
  });

  it('returns 400 when sale is not PAID or PARTIALLY_REFUNDED', async () => {
    mockPrisma.sale.findFirst.mockResolvedValue({ ...SAMPLE_SALE, paymentStatus: 'PENDING' });
    const req = createReq({ method: 'POST' });
    const res = await refundHandlers.POST(req as any, params('sale-1'));
    expect(res.status).toBe(400);
  });

  it('returns 400 when no payment intent exists', async () => {
    mockPrisma.sale.findFirst.mockResolvedValue({
      ...SAMPLE_SALE,
      paymentStatus: 'PAID',
      stripePaymentIntentId: null,
    });
    const req = createReq({ method: 'POST' });
    const res = await refundHandlers.POST(req as any, params('sale-1'));
    expect(res.status).toBe(400);
  });

  it('returns 400 when refund exceeds remaining amount', async () => {
    mockPrisma.sale.findFirst.mockResolvedValue({
      ...SAMPLE_SALE,
      paymentStatus: 'PAID',
      totalAed: 1000,
      refundedAed: 500,
    });
    const req = createReq({ method: 'POST', body: { amountAed: 600 } });
    const res = await refundHandlers.POST(req as any, params('sale-1'));
    expect(res.status).toBe(400);
  });
});

// ── Get Single Sale ──────────────────────────────────────────────────────
describe('GET /api/pos/sales/[id]', () => {
  beforeEach(() => vi.clearAllMocks());

  it('returns sale with member and staff info', async () => {
    mockPrisma.sale.findFirst.mockResolvedValue({
      ...SAMPLE_SALE,
      lines: [{ id: 'line-1', kind: 'PRODUCT', nameSnapshot: 'Shake', quantity: 1, unitPriceAed: 2500, vatAed: 125, totalAed: 2625 }],
      member: { id: 'mem-1', fullName: 'Ahmed', email: null, phone: '+971501234567' },
      staff: { id: 'stf-1', fullName: 'Coach Ali' },
    });

    const req = createReq();
    const res = await getOneHandlers.GET(req as any, params('sale-1'));
    const body: any = await jsonBody(res);

    expect(res.status).toBe(200);
    expect(body.member.fullName).toBe('Ahmed');
    expect(body.lines).toHaveLength(1);
  });

  it('returns 404 when sale not found', async () => {
    mockPrisma.sale.findFirst.mockResolvedValue(null);
    const req = createReq();
    const res = await getOneHandlers.GET(req as any, params('ghost'));
    expect(res.status).toBe(404);
  });
});

// ── Daily Report ─────────────────────────────────────────────────────────
describe('GET /api/pos/sales/reports/daily', () => {
  beforeEach(() => vi.clearAllMocks());

  it('returns daily sales aggregation', async () => {
    mockPrisma.sale.aggregate.mockResolvedValue({
      _sum: { subtotalAed: 50000, vatAed: 2500, totalAed: 52500 },
      _count: { _all: 12 },
    });

    const req = createReq({ searchParams: { date: '2026-06-07' } });
    const res = await dailyHandlers.GET(req as any);
    const body: any = await jsonBody(res);

    expect(res.status).toBe(200);
    expect(body._sum.totalAed).toBe(52500);
    expect(body._count._all).toBe(12);
  });

  it('defaults to today when no date param', async () => {
    mockPrisma.sale.aggregate.mockResolvedValue({
      _sum: { subtotalAed: 0, vatAed: 0, totalAed: 0 },
      _count: { _all: 0 },
    });

    const req = createReq();
    const res = await dailyHandlers.GET(req as any);
    expect(res.status).toBe(200);
  });
});

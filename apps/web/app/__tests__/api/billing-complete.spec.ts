/**
 * Billing API — Complete Tests (Round 2 additions)
 *
 * Newly created endpoints: POST invoice, PATCH invoice, reconciliation, payment-link, html
 */
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { MOCK_USER, createReq, jsonBody, NOW } from './test-helpers';

const mockPrisma = {
  invoice: {
    findMany: vi.fn(), findFirst: vi.fn(), create: vi.fn(),
    update: vi.fn(), count: vi.fn(), aggregate: vi.fn(),
  },
  sale: {
    aggregate: vi.fn(),
  },
  member: {
    count: vi.fn(),
  },
  membershipPlan: {
    aggregate: vi.fn(),
  },
  paymentAttempt: {
    findMany: vi.fn(), create: vi.fn(),
  },
  $transaction: vi.fn((arg: any) => {
    if (Array.isArray(arg)) return Promise.all(arg);
    return arg(mockPrisma);
  }),
};

vi.mock('@/lib/prisma', () => ({ prisma: mockPrisma }));
vi.mock("@/lib/auth-server", () => ({
  requireServerUser: vi.fn().mockResolvedValue({
    id: "user-1", email: "owner@testgym.ae", fullName: "Test Owner",
    tenantId: "tenant-1", role: "OWNER",
  }),
  requireTenantId: vi.fn().mockResolvedValue("tenant-1"),
  getServerUser: vi.fn().mockResolvedValue({
    id: "user-1", email: "owner@testgym.ae", fullName: "Test Owner",
    tenantId: "tenant-1", role: "OWNER",
  }),
}));

const invoiceHandlers = await import('../../api/billing/invoices/route');
const invoiceIdHandlers = await import('../../api/billing/invoices/[id]/route');
const reconciliationHandlers = await import('../../api/billing/reconciliation/route');
const paymentLinkHandlers = await import('../../api/billing/invoices/[id]/payment-link/route');
const htmlHandlers = await import('../../api/billing/invoices/[id]/html/route');

describe('Billing API — Create & Edit', () => {
  beforeEach(() => vi.clearAllMocks());

  it('POST /api/billing/invoices — creates an invoice', async () => {
    mockPrisma.invoice.create.mockResolvedValue({
      id: 'inv-new', tenantId: MOCK_USER.tenantId, memberId: 'mem-1',
      amountAed: 29900, vatAed: 1495, dueDate: new Date('2026-07-01'),
      status: 'DUE', description: 'Monthly membership',
      member: { id: 'mem-1', fullName: 'Ahmed', phone: null, email: null },
      attempts: [],
    });

    const req = createReq({
      method: 'POST',
      body: {
        memberId: 'mem-1',
        amountAed: 29900,
        vatAed: 1495,
        dueDate: '2026-07-01T00:00:00.000Z',
        description: 'Monthly membership',
      },
    });
    const res = await invoiceHandlers.POST(req as any);
    const body: any = await jsonBody(res);

    expect(res.status).toBe(201);
    expect(body.amountAed).toBe(29900);
    expect(body.status).toBe('DUE');
  });

  it('POST /api/billing/invoices — returns 400 when required fields missing', async () => {
    const req = createReq({ method: 'POST', body: { memberId: 'mem-1' } });
    const res = await invoiceHandlers.POST(req as any);
    expect(res.status).toBe(400);
  });

  it('PATCH /api/billing/invoices/[id] — updates a DUE invoice', async () => {
    mockPrisma.invoice.findFirst.mockResolvedValue({
      id: 'inv-1', tenantId: MOCK_USER.tenantId, status: 'DUE', amountAed: 10000,
    });
    mockPrisma.invoice.update.mockResolvedValue({
      id: 'inv-1', amountAed: 15000, vatAed: 750, status: 'DUE',
      member: { id: 'mem-1', fullName: 'Ahmed', phone: null, email: null },
      attempts: [],
    });

    const req = createReq({
      method: 'PATCH',
      body: { amountAed: 15000, vatAed: 750 },
    });
    const res = await invoiceIdHandlers.PATCH(req as any, { params: Promise.resolve({ id: 'inv-1' }) });
    const body: any = await jsonBody(res);

    expect(res.status).toBe(200);
    expect(body.amountAed).toBe(15000);
  });

  it('PATCH — returns 404 when invoice not found', async () => {
    mockPrisma.invoice.findFirst.mockResolvedValue(null);
    const req = createReq({ method: 'PATCH', body: { amountAed: 10000 } });
    const res = await invoiceIdHandlers.PATCH(req as any, { params: Promise.resolve({ id: 'ghost' }) });
    expect(res.status).toBe(404);
  });

  it('PATCH — returns 400 when invoice is not DUE', async () => {
    mockPrisma.invoice.findFirst.mockResolvedValue({
      id: 'inv-paid', status: 'PAID', tenantId: MOCK_USER.tenantId,
    });
    const req = createReq({ method: 'PATCH', body: { amountAed: 10000 } });
    const res = await invoiceIdHandlers.PATCH(req as any, { params: Promise.resolve({ id: 'inv-paid' }) });
    expect(res.status).toBe(400);
  });
});

describe('Billing API — Reconciliation', () => {
  beforeEach(() => vi.clearAllMocks());

  it('GET /api/billing/reconciliation — returns revenue summary', async () => {
    mockPrisma.sale.aggregate.mockResolvedValue({ _sum: { totalAed: 500000 } });
    mockPrisma.invoice.aggregate.mockResolvedValue({ _sum: { amountAed: 300000 } });
    mockPrisma.member.count.mockResolvedValue(120);
    mockPrisma.membershipPlan.aggregate.mockResolvedValue({ _avg: { priceAed: 299 } });

    const req = createReq();
    const res = await reconciliationHandlers.GET(req as any);
    const body: any = await jsonBody(res);

    expect(res.status).toBe(200);
    expect(body.posRevenueAed).toBe('5000.00');
    expect(body.invoiceRevenueAed).toBe('3000.00');
    expect(body.totalRevenueAed).toBe('8000.00');
    expect(body.activeMembers).toBe(120);
    expect(body.estimatedMonthlyAed).toBe('35880.00'); // 120 × 299
  });
});

describe('Billing API — Payment Link & HTML', () => {
  beforeEach(() => vi.clearAllMocks());

  it('POST /api/billing/invoices/[id]/payment-link — generates a URL', async () => {
    mockPrisma.invoice.findFirst.mockResolvedValue({
      id: 'inv-1', tenantId: MOCK_USER.tenantId,
      member: { fullName: 'Ahmed', email: 'ahmed@test.com' },
    });

    const req = createReq({ method: 'POST' });
    const res = await paymentLinkHandlers.POST(req as any, { params: Promise.resolve({ id: 'inv-1' }) });
    const body: any = await jsonBody(res);

    expect(res.status).toBe(200);
    expect(body.url).toContain('inv-1');
  });

  it('POST /api/billing/invoices/[id]/payment-link — returns 404 when not found', async () => {
    mockPrisma.invoice.findFirst.mockResolvedValue(null);
    const req = createReq({ method: 'POST' });
    const res = await paymentLinkHandlers.POST(req as any, { params: Promise.resolve({ id: 'ghost' }) });
    expect(res.status).toBe(404);
  });

  it('GET /api/billing/invoices/[id]/html — returns invoice HTML', async () => {
    mockPrisma.invoice.findFirst.mockResolvedValue({
      id: 'inv-html-1', tenantId: MOCK_USER.tenantId,
      amountAed: 29900, vatAed: 1495, status: 'DUE',
      dueDate: new Date('2026-07-01'), description: 'Monthly',
      createdAt: NOW,
      member: { fullName: 'Ahmed', phone: '+971501234567', email: null },
    });

    const req = createReq();
    const res = await htmlHandlers.GET(req as any, { params: Promise.resolve({ id: 'inv-html-1' }) });
    const body: any = await jsonBody(res);

    expect(res.status).toBe(200);
    expect(body.html).toContain('Ahmed');
    expect(body.html).toContain('299.00'); // 29900 / 100
    expect(body.html).toContain('313.95'); // (29900 + 1495) / 100
  });

  it('GET /api/billing/invoices/[id]/html — returns 404 when not found', async () => {
    mockPrisma.invoice.findFirst.mockResolvedValue(null);
    const req = createReq();
    const res = await htmlHandlers.GET(req as any, { params: Promise.resolve({ id: 'ghost' }) });
    expect(res.status).toBe(404);
  });
});

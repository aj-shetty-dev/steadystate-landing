/**
 * Billing API — Complete Tests
 *
 * Covers: Invoices (CRUD, void, write-off, payment-link, HTML), reconciliation,
 * salary-window, schedule, process. Fixed: falsy-0 amount bug, missing Zod validation,
 * inconsistent error keys.
 */
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { MOCK_USER, createReq, jsonBody, NOW } from './test-helpers';

const mockPrisma = {
  invoice: {
    findMany: vi.fn(), findFirst: vi.fn(), create: vi.fn(),
    update: vi.fn(), count: vi.fn(), aggregate: vi.fn(),
  },
  sale: { aggregate: vi.fn() },
  member: { count: vi.fn() },
  membershipPlan: { aggregate: vi.fn() },
  paymentAttempt: {
    findMany: vi.fn(), create: vi.fn(), update: vi.fn(),
  },
  salaryWindow: {
    findUnique: vi.fn(), upsert: vi.fn(),
  },
  $transaction: vi.fn((arg: any) => {
    if (Array.isArray(arg)) return Promise.all(arg);
    return arg(mockPrisma);
  }),
};

vi.mock('@/lib/prisma', () => ({ prisma: mockPrisma }));

// Mock WhatsApp to avoid real sends
vi.mock('@/lib/whatsapp', () => ({
  sendWhatsapp: vi.fn().mockResolvedValue(undefined),
}));

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
const voidHandlers = await import('../../api/billing/invoices/[id]/void/route');
const writeOffHandlers = await import('../../api/billing/invoices/[id]/write-off/route');
const reconciliationHandlers = await import('../../api/billing/reconciliation/route');
const paymentLinkHandlers = await import('../../api/billing/invoices/[id]/payment-link/route');
const htmlHandlers = await import('../../api/billing/invoices/[id]/html/route');
const salaryWindowHandlers = await import('../../api/billing/salary-window/route');
const scheduleHandlers = await import('../../api/billing/schedule/route');
const processHandlers = await import('../../api/billing/process/route');

function params(id: string) {
  return { params: Promise.resolve({ id }) };
}

/* ─────────────────────────────────────────────────────────────────── */
/* Invoice CRUD                                                       */
/* ─────────────────────────────────────────────────────────────────── */
describe('POST /api/billing/invoices — Create', () => {
  beforeEach(() => vi.clearAllMocks());

  it('creates an invoice with all fields and returns 201', async () => {
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
        memberId: 'mem-1', amountAed: 29900, vatAed: 1495,
        dueDate: '2026-07-01T00:00:00.000Z', description: 'Monthly membership',
      },
    });
    const res = await invoiceHandlers.POST(req as any);
    const body: any = await jsonBody(res);

    expect(res.status).toBe(201);
    expect(body.amountAed).toBe(29900);
    expect(body.status).toBe('DUE');
  });

  it('creates a minimal invoice (only required fields)', async () => {
    mockPrisma.invoice.create.mockResolvedValue({
      id: 'inv-min', memberId: 'mem-1', amountAed: 10000, vatAed: 0,
      dueDate: new Date(), status: 'DUE', description: null,
      member: null, attempts: [],
    });

    const req = createReq({
      method: 'POST',
      body: { memberId: 'mem-1', amountAed: 10000, dueDate: '2026-07-01' },
    });
    const res = await invoiceHandlers.POST(req as any);

    expect(res.status).toBe(201);
  });

  // FALSY-0 BUG FIX: amountAed=0 is now valid (free invoice)
  it('accepts amountAed of 0 (free invoice) — falsy-0 bug fix', async () => {
    mockPrisma.invoice.create.mockResolvedValue({
      id: 'inv-free', memberId: 'mem-1', amountAed: 0, vatAed: 0,
      dueDate: new Date(), status: 'DUE',
      member: null, attempts: [],
    });

    const req = createReq({
      method: 'POST',
      body: { memberId: 'mem-1', amountAed: 0, dueDate: '2026-07-01' },
    });
    const res = await invoiceHandlers.POST(req as any);

    expect(res.status).toBe(201);
  });

  it('returns 400 with fieldErrors when memberId missing', async () => {
    const req = createReq({
      method: 'POST',
      body: { amountAed: 10000, dueDate: '2026-07-01' },
    });
    const res = await invoiceHandlers.POST(req as any);
    const body = await jsonBody(res);

    expect(res.status).toBe(400);
    expect(body.fieldErrors).toBeDefined();
    expect(body.fieldErrors.memberId).toBeTruthy();
  });

  it('returns 400 when amountAed is negative', async () => {
    const req = createReq({
      method: 'POST',
      body: { memberId: 'mem-1', amountAed: -1, dueDate: '2026-07-01' },
    });
    const res = await invoiceHandlers.POST(req as any);

    expect(res.status).toBe(400);
  });

  it('returns 400 when dueDate is empty', async () => {
    const req = createReq({
      method: 'POST',
      body: { memberId: 'mem-1', amountAed: 10000, dueDate: '' },
    });
    const res = await invoiceHandlers.POST(req as any);

    expect(res.status).toBe(400);
  });

  it('returns 400 when amountAed is not a number', async () => {
    const req = createReq({
      method: 'POST',
      body: { memberId: 'mem-1', amountAed: 'not-a-number', dueDate: '2026-07-01' },
    });
    const res = await invoiceHandlers.POST(req as any);

    expect(res.status).toBe(400);
  });
});

describe('GET /api/billing/invoices — List', () => {
  beforeEach(() => vi.clearAllMocks());

  it('returns paginated invoices with member info', async () => {
    mockPrisma.invoice.findMany.mockResolvedValue([
      { id: 'inv-1', amountAed: 29900, vatAed: 1495, status: 'DUE', dueDate: NOW,
        description: null, member: { id: 'mem-1', fullName: 'Ahmed', phone: '+971501234567' } },
    ]);
    mockPrisma.invoice.count.mockResolvedValue(1);

    const req = createReq({ searchParams: { page: '1', pageSize: '25' } });
    const res = await invoiceHandlers.GET(req as any);
    const body: any = await jsonBody(res);

    expect(res.status).toBe(200);
    expect(body.items).toHaveLength(1);
    expect(body.total).toBe(1);
    expect(body.items[0].member.fullName).toBe('Ahmed');
  });

  it('filters by status', async () => {
    mockPrisma.invoice.findMany.mockResolvedValue([]);
    mockPrisma.invoice.count.mockResolvedValue(0);

    const req = createReq({ searchParams: { status: 'PAID' } });
    await invoiceHandlers.GET(req as any);

    const where = mockPrisma.invoice.findMany.mock.calls[0][0].where;
    expect(where.status).toBe('PAID');
  });

  it('rejects invalid status filter and returns 400', async () => {
    const req = createReq({ searchParams: { status: 'BOGUS' } });
    const res = await invoiceHandlers.GET(req as any);

    expect(res.status).toBe(400);
  });

  it('filters by memberId', async () => {
    mockPrisma.invoice.findMany.mockResolvedValue([]);
    mockPrisma.invoice.count.mockResolvedValue(0);

    const req = createReq({ searchParams: { memberId: 'mem-1' } });
    await invoiceHandlers.GET(req as any);

    const where = mockPrisma.invoice.findMany.mock.calls[0][0].where;
    expect(where.memberId).toBe('mem-1');
  });

  it('filters by search (member name)', async () => {
    mockPrisma.invoice.findMany.mockResolvedValue([]);
    mockPrisma.invoice.count.mockResolvedValue(0);

    const req = createReq({ searchParams: { search: 'Ahmed' } });
    await invoiceHandlers.GET(req as any);

    const where = mockPrisma.invoice.findMany.mock.calls[0][0].where;
    expect(where.member).toBeDefined();
  });
});

/* ─────────────────────────────────────────────────────────────────── */
/* Invoice Detail + Edit                                               */
/* ─────────────────────────────────────────────────────────────────── */
describe('GET /api/billing/invoices/[id] — Detail', () => {
  beforeEach(() => vi.clearAllMocks());

  it('returns invoice with member info and attempts', async () => {
    mockPrisma.invoice.findFirst.mockResolvedValue({
      id: 'inv-1', amountAed: 29900, vatAed: 1495, status: 'DUE',
      dueDate: NOW, description: 'Monthly',
      member: { id: 'mem-1', fullName: 'Ahmed', phone: '+971501234567', email: null },
      attempts: [],
    });

    const req = createReq();
    const res = await invoiceIdHandlers.GET(req as any, params('inv-1'));
    const body: any = await jsonBody(res);

    expect(res.status).toBe(200);
    expect(body.amountAed).toBe(29900);
  });

  it('returns 404 with message key', async () => {
    mockPrisma.invoice.findFirst.mockResolvedValue(null);

    const req = createReq();
    const res = await invoiceIdHandlers.GET(req as any, params('ghost'));
    const body = await jsonBody(res);

    expect(res.status).toBe(404);
    expect(body.message).toBe('Invoice not found');
  });
});

describe('PATCH /api/billing/invoices/[id] — Update', () => {
  beforeEach(() => vi.clearAllMocks());

  it('updates a DUE invoice', async () => {
    mockPrisma.invoice.findFirst.mockResolvedValue({
      id: 'inv-1', tenantId: MOCK_USER.tenantId, status: 'DUE', amountAed: 10000,
    });
    mockPrisma.invoice.update.mockResolvedValue({
      id: 'inv-1', amountAed: 15000, vatAed: 750, status: 'DUE',
      member: { id: 'mem-1', fullName: 'Ahmed', phone: null, email: null },
      attempts: [],
    });

    const req = createReq({ method: 'PATCH', body: { amountAed: 15000, vatAed: 750 } });
    const res = await invoiceIdHandlers.PATCH(req as any, params('inv-1'));
    const body: any = await jsonBody(res);

    expect(res.status).toBe(200);
    expect(body.amountAed).toBe(15000);
  });

  it('allows updating amountAed to 0', async () => {
    mockPrisma.invoice.findFirst.mockResolvedValue({
      id: 'inv-1', tenantId: MOCK_USER.tenantId, status: 'DUE',
    });
    mockPrisma.invoice.update.mockResolvedValue({
      id: 'inv-1', amountAed: 0, vatAed: 0, status: 'DUE',
      member: null, attempts: [],
    });

    const req = createReq({ method: 'PATCH', body: { amountAed: 0 } });
    const res = await invoiceIdHandlers.PATCH(req as any, params('inv-1'));

    expect(res.status).toBe(200);
  });

  it('updates dueDate', async () => {
    mockPrisma.invoice.findFirst.mockResolvedValue({
      id: 'inv-1', tenantId: MOCK_USER.tenantId, status: 'DUE',
    });
    mockPrisma.invoice.update.mockResolvedValue({
      id: 'inv-1', amountAed: 10000, dueDate: new Date('2026-12-31'),
      status: 'DUE', member: null, attempts: [],
    });

    const req = createReq({ method: 'PATCH', body: { dueDate: '2026-12-31' } });
    const res = await invoiceIdHandlers.PATCH(req as any, params('inv-1'));

    expect(res.status).toBe(200);
  });

  it('returns 404 when invoice not found', async () => {
    mockPrisma.invoice.findFirst.mockResolvedValue(null);
    const req = createReq({ method: 'PATCH', body: { amountAed: 10000 } });
    const res = await invoiceIdHandlers.PATCH(req as any, params('ghost'));

    expect(res.status).toBe(404);
  });

  it('returns 400 when invoice is PAID (not DUE)', async () => {
    mockPrisma.invoice.findFirst.mockResolvedValue({
      id: 'inv-paid', status: 'PAID', tenantId: MOCK_USER.tenantId,
    });
    const req = createReq({ method: 'PATCH', body: { amountAed: 10000 } });
    const res = await invoiceIdHandlers.PATCH(req as any, params('inv-paid'));

    expect(res.status).toBe(400);
  });
});

/* ─────────────────────────────────────────────────────────────────── */
/* Void + Write-off                                                    */
/* ─────────────────────────────────────────────────────────────────── */
describe('POST /api/billing/invoices/[id]/void', () => {
  beforeEach(() => vi.clearAllMocks());

  it('voids an invoice (sets to WRITTEN_OFF)', async () => {
    mockPrisma.invoice.findFirst.mockResolvedValue({
      id: 'inv-1', tenantId: MOCK_USER.tenantId, status: 'DUE',
    });
    mockPrisma.invoice.update.mockResolvedValue({
      id: 'inv-1', status: 'WRITTEN_OFF',
    });

    const req = createReq({ method: 'POST' });
    const res = await voidHandlers.POST(req as any, params('inv-1'));

    expect(res.status).toBe(200);
    expect(mockPrisma.invoice.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: { status: 'WRITTEN_OFF' } }),
    );
  });

  it('returns 404 when not found', async () => {
    mockPrisma.invoice.findFirst.mockResolvedValue(null);
    const req = createReq({ method: 'POST' });
    const res = await voidHandlers.POST(req as any, params('ghost'));

    expect(res.status).toBe(404);
  });

  it('returns 400 when invoice is already PAID', async () => {
    mockPrisma.invoice.findFirst.mockResolvedValue({
      id: 'inv-paid', tenantId: MOCK_USER.tenantId, status: 'PAID',
    });
    const req = createReq({ method: 'POST' });
    const res = await voidHandlers.POST(req as any, params('inv-paid'));
    const body = await jsonBody(res);

    expect(res.status).toBe(400);
    expect(body.message).toContain('Cannot void');
  });
});

describe('POST /api/billing/invoices/[id]/write-off', () => {
  beforeEach(() => vi.clearAllMocks());

  it('writes off an invoice', async () => {
    mockPrisma.invoice.findFirst.mockResolvedValue({
      id: 'inv-1', tenantId: MOCK_USER.tenantId, status: 'DUE',
    });
    mockPrisma.invoice.update.mockResolvedValue({
      id: 'inv-1', status: 'WRITTEN_OFF',
    });

    const req = createReq({ method: 'POST' });
    const res = await writeOffHandlers.POST(req as any, params('inv-1'));

    expect(res.status).toBe(200);
  });

  it('returns 404 when not found', async () => {
    mockPrisma.invoice.findFirst.mockResolvedValue(null);
    const req = createReq({ method: 'POST' });
    const res = await writeOffHandlers.POST(req as any, params('ghost'));

    expect(res.status).toBe(404);
  });

  it('returns 400 when invoice is already PAID', async () => {
    mockPrisma.invoice.findFirst.mockResolvedValue({
      id: 'inv-paid', tenantId: MOCK_USER.tenantId, status: 'PAID',
    });
    const req = createReq({ method: 'POST' });
    const res = await writeOffHandlers.POST(req as any, params('inv-paid'));

    expect(res.status).toBe(400);
  });
});

/* ─────────────────────────────────────────────────────────────────── */
/* Reconciliation                                                      */
/* ─────────────────────────────────────────────────────────────────── */
describe('GET /api/billing/reconciliation', () => {
  beforeEach(() => vi.clearAllMocks());

  it('returns revenue summary from POS + invoices', async () => {
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
  });

  it('handles zero/null aggregates gracefully', async () => {
    mockPrisma.sale.aggregate.mockResolvedValue({ _sum: { totalAed: null } });
    mockPrisma.invoice.aggregate.mockResolvedValue({ _sum: { amountAed: null } });
    mockPrisma.member.count.mockResolvedValue(0);
    mockPrisma.membershipPlan.aggregate.mockResolvedValue({ _avg: { priceAed: null } });

    const req = createReq();
    const res = await reconciliationHandlers.GET(req as any);
    const body: any = await jsonBody(res);

    expect(res.status).toBe(200);
    expect(body.totalRevenueAed).toBe('0.00');
    expect(body.activeMembers).toBe(0);
    expect(body.estimatedMonthlyAed).toBe('0.00');
  });
});

/* ─────────────────────────────────────────────────────────────────── */
/* Payment Link + HTML                                                 */
/* ─────────────────────────────────────────────────────────────────── */
describe('POST /api/billing/invoices/[id]/payment-link', () => {
  beforeEach(() => vi.clearAllMocks());

  it('generates a payment URL for the invoice', async () => {
    mockPrisma.invoice.findFirst.mockResolvedValue({
      id: 'inv-1', tenantId: MOCK_USER.tenantId,
      member: { fullName: 'Ahmed', email: 'ahmed@test.com' },
    });

    const req = createReq({ method: 'POST' });
    const res = await paymentLinkHandlers.POST(req as any, params('inv-1'));
    const body: any = await jsonBody(res);

    expect(res.status).toBe(200);
    expect(body.url).toContain('inv-1');
  });

  it('returns 404 when invoice not found', async () => {
    mockPrisma.invoice.findFirst.mockResolvedValue(null);
    const req = createReq({ method: 'POST' });
    const res = await paymentLinkHandlers.POST(req as any, params('ghost'));

    expect(res.status).toBe(404);
  });
});

describe('GET /api/billing/invoices/[id]/html', () => {
  beforeEach(() => vi.clearAllMocks());

  it('returns invoice HTML with member details', async () => {
    mockPrisma.invoice.findFirst.mockResolvedValue({
      id: 'inv-html-1', tenantId: MOCK_USER.tenantId,
      amountAed: 29900, vatAed: 1495, status: 'DUE',
      dueDate: new Date('2026-07-01'), description: 'Monthly',
      createdAt: NOW,
      member: { fullName: 'Ahmed', phone: '+971501234567', email: null },
    });

    const req = createReq();
    const res = await htmlHandlers.GET(req as any, params('inv-html-1'));
    const body: any = await jsonBody(res);

    expect(res.status).toBe(200);
    expect(body.html).toContain('Ahmed');
    expect(body.html).toContain('299.00');
    expect(body.html).toContain('313.95'); // total with VAT
  });

  it('returns 404 when not found', async () => {
    mockPrisma.invoice.findFirst.mockResolvedValue(null);
    const req = createReq();
    const res = await htmlHandlers.GET(req as any, params('ghost'));

    expect(res.status).toBe(404);
  });

  it('omits phone row when phone is null', async () => {
    mockPrisma.invoice.findFirst.mockResolvedValue({
      id: 'inv-1', tenantId: MOCK_USER.tenantId,
      amountAed: 10000, vatAed: 0, status: 'DUE',
      dueDate: NOW, description: null, createdAt: NOW,
      member: { fullName: 'Ahmed', phone: null, email: null },
    });

    const req = createReq();
    const res = await htmlHandlers.GET(req as any, params('inv-1'));
    const body: any = await jsonBody(res);

    expect(res.status).toBe(200);
    expect(body.html).not.toContain('Phone');
  });
});

/* ─────────────────────────────────────────────────────────────────── */
/* Salary Window                                                       */
/* ─────────────────────────────────────────────────────────────────── */
describe('Salary Window API', () => {
  beforeEach(() => vi.clearAllMocks());

  it('GET returns null when no window configured', async () => {
    mockPrisma.salaryWindow.findUnique.mockResolvedValue(null);

    const req = createReq();
    const res = await salaryWindowHandlers.GET(req as any);

    expect(res.status).toBe(200);
  });

  it('GET returns existing window config', async () => {
    mockPrisma.salaryWindow.findUnique.mockResolvedValue({
      id: 'sw-1', tenantId: MOCK_USER.tenantId,
      startDay: 25, endDay: 28, timezone: 'Asia/Dubai', jitterMinutes: 120,
    });

    const req = createReq();
    const res = await salaryWindowHandlers.GET(req as any);
    const body: any = await jsonBody(res);

    expect(res.status).toBe(200);
    expect(body.startDay).toBe(25);
    expect(body.endDay).toBe(28);
  });

  it('POST creates or updates salary window', async () => {
    mockPrisma.salaryWindow.upsert.mockResolvedValue({
      id: 'sw-1', tenantId: MOCK_USER.tenantId,
      startDay: 25, endDay: 28, timezone: 'Asia/Dubai', jitterMinutes: 60,
    });

    const req = createReq({
      method: 'POST',
      body: { startDay: 25, endDay: 28, jitterMinutes: 60 },
    });
    const res = await salaryWindowHandlers.POST(req as any);
    const body: any = await jsonBody(res);

    expect(res.status).toBe(200);
    expect(body.jitterMinutes).toBe(60);
  });

  it('POST returns 400 with fieldErrors for invalid startDay', async () => {
    const req = createReq({
      method: 'POST',
      body: { startDay: 32, endDay: 28 }, // startDay > 31
    });
    const res = await salaryWindowHandlers.POST(req as any);
    const body = await jsonBody(res);

    expect(res.status).toBe(400);
    expect(body.fieldErrors).toBeDefined();
  });

  it('POST returns 400 when startDay > endDay', async () => {
    const req = createReq({
      method: 'POST',
      body: { startDay: 20, endDay: 10 },
    });
    const res = await salaryWindowHandlers.POST(req as any);
    const body = await jsonBody(res);

    expect(res.status).toBe(400);
    expect(body.message).toContain('startDay cannot be after endDay');
  });
});

/* ─────────────────────────────────────────────────────────────────── */
/* Schedule                                                            */
/* ─────────────────────────────────────────────────────────────────── */
describe('Billing Schedule API', () => {
  beforeEach(() => vi.clearAllMocks());

  it('GET returns salary window span', async () => {
    mockPrisma.salaryWindow.findUnique.mockResolvedValue(null); // defaults

    const req = createReq();
    const res = await scheduleHandlers.GET(req as any);
    const body: any = await jsonBody(res);

    expect(res.status).toBe(200);
    expect(body.window).toBeDefined();
    expect(body.window.startDay).toBe(25);
    expect(body.span).toBeDefined();
    expect(body.span.from).toBeDefined();
    expect(body.span.to).toBeDefined();
  });

  it('POST schedules retries for FAILED invoices', async () => {
    mockPrisma.salaryWindow.findUnique.mockResolvedValue(null);
    mockPrisma.invoice.findMany.mockResolvedValue([
      {
        id: 'inv-1', status: 'FAILED',
        attempts: [],
      },
    ]);
    mockPrisma.paymentAttempt.create.mockResolvedValue({ id: 'pa-1' });
    mockPrisma.invoice.update.mockResolvedValue({ id: 'inv-1', status: 'RETRY_SCHEDULED' });

    const req = createReq({ method: 'POST' });
    const res = await scheduleHandlers.POST(req as any);
    const body: any = await jsonBody(res);

    expect(res.status).toBe(200);
    expect(body.eligible).toBe(1);
    expect(body.scheduled).toBe(1);
    expect(body.alreadyScheduled).toBe(0);
  });

  it('POST skips invoices that already have pending attempts', async () => {
    mockPrisma.salaryWindow.findUnique.mockResolvedValue(null);
    mockPrisma.invoice.findMany.mockResolvedValue([
      {
        id: 'inv-1', status: 'FAILED',
        attempts: [{ id: 'pa-existing', outcome: 'PENDING' }],
      },
    ]);

    const req = createReq({ method: 'POST' });
    const res = await scheduleHandlers.POST(req as any);
    const body: any = await jsonBody(res);

    expect(res.status).toBe(200);
    expect(body.alreadyScheduled).toBe(1);
    expect(body.scheduled).toBe(0);
  });
});

/* ─────────────────────────────────────────────────────────────────── */
/* Process                                                             */
/* ─────────────────────────────────────────────────────────────────── */
describe('POST /api/billing/process', () => {
  beforeEach(() => vi.clearAllMocks());

  it('processes due payment attempts', async () => {
    mockPrisma.paymentAttempt.findMany.mockResolvedValue([
      {
        id: 'pa-1', tenantId: MOCK_USER.tenantId, outcome: 'PENDING',
        scheduledFor: new Date(Date.now() - 86400000),
        invoice: {
          amountAed: 29900, vatAed: 1495,
          member: {
            id: 'mem-1', fullName: 'Ahmed Mansoori',
            phone: '+971501234567', preferredLocale: 'EN',
          },
        },
      },
    ]);
    mockPrisma.paymentAttempt.update.mockResolvedValue({});

    const req = createReq({ method: 'POST' });
    const res = await processHandlers.POST(req as any);
    const body: any = await jsonBody(res);

    expect(res.status).toBe(200);
    expect(body.processed).toBe(1);
  });

  it('skips attempts where member has no phone', async () => {
    mockPrisma.paymentAttempt.findMany.mockResolvedValue([
      {
        id: 'pa-1', tenantId: MOCK_USER.tenantId, outcome: 'PENDING',
        scheduledFor: new Date(Date.now() - 86400000),
        invoice: {
          amountAed: 29900, vatAed: 0,
          member: {
            id: 'mem-1', fullName: 'Ahmed',
            phone: null, preferredLocale: 'EN',
          },
        },
      },
    ]);
    mockPrisma.paymentAttempt.update.mockResolvedValue({});

    const req = createReq({ method: 'POST' });
    const res = await processHandlers.POST(req as any);
    const body: any = await jsonBody(res);

    expect(res.status).toBe(200);
    expect(body.skipped).toBe(1);
  });

  it('returns empty results when nothing due', async () => {
    mockPrisma.paymentAttempt.findMany.mockResolvedValue([]);

    const req = createReq({ method: 'POST' });
    const res = await processHandlers.POST(req as any);
    const body: any = await jsonBody(res);

    expect(res.status).toBe(200);
    expect(body.processed).toBe(0);
  });
});

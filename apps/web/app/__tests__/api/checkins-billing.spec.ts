/**
 * Check-Ins & Billing API — End-to-End Flow Tests
 *
 * Check-ins: Manual → by phone → by memberId → dedupe → cancelled member rejection
 * Billing: Invoices → Process → Void → Write-off → Salary window
 */
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { MOCK_USER, createReq, jsonBody, NOW } from './test-helpers';

/* ------------------------------------------------------------------ */
/* Mock prisma                                                        */
/* ------------------------------------------------------------------ */
const mockPrisma = {
  checkIn: {
    findMany: vi.fn(), findFirst: vi.fn(), create: vi.fn(),
  },
  member: {
    findFirst: vi.fn(), update: vi.fn(),
  },
  memberQrToken: {
    findFirst: vi.fn(),
  },
  staff: {
    findFirst: vi.fn(),
  },
  booking: {
    findFirst: vi.fn(), update: vi.fn(),
  },
  invoice: {
    findMany: vi.fn(), findFirst: vi.fn(), create: vi.fn(), update: vi.fn(), count: vi.fn(),
  },
  paymentAttempt: {
    findMany: vi.fn(), create: vi.fn(),
  },
  salaryWindow: {
    findFirst: vi.fn(), upsert: vi.fn(),
  },
  $transaction: vi.fn((fn: any) => fn(mockPrisma)),
};

vi.mock('@/lib/prisma', () => ({ prisma: mockPrisma }));
vi.mock("@/lib/auth-server", () => ({
  requireServerUser: vi.fn().mockResolvedValue({ id: "user-1", email: "owner@testgym.ae", fullName: "Test Owner", tenantId: "tenant-1", role: "OWNER" }),
  requireTenantId: vi.fn().mockResolvedValue("tenant-1"),
  getServerUser: vi.fn().mockResolvedValue({ id: "user-1", email: "owner@testgym.ae", fullName: "Test Owner", tenantId: "tenant-1", role: "OWNER" }),
}));

const checkinHandlers = await import('../../api/checkins/route');
const checkinByCodeHandlers = await import('../../api/checkins/by-code/route');
const invoiceHandlers = await import('../../api/billing/invoices/route');
const invoiceIdHandlers = await import('../../api/billing/invoices/[id]/route');
const invoiceVoidHandlers = await import('../../api/billing/invoices/[id]/void/route');
const invoiceWriteOffHandlers = await import('../../api/billing/invoices/[id]/write-off/route');
const billingProcessHandlers = await import('../../api/billing/process/route');
const salaryWindowHandlers = await import('../../api/billing/salary-window/route');

/* ------------------------------------------------------------------ */
/* Check-Ins Tests                                                    */
/* ------------------------------------------------------------------ */
describe('Check-Ins API', () => {
  beforeEach(() => vi.clearAllMocks());

  describe('POST /api/checkins — Create Check-In', () => {
    it('creates a manual check-in by memberId', async () => {
      mockPrisma.member.findFirst.mockResolvedValue({
        id: 'm1', tenantId: MOCK_USER.tenantId, fullName: 'Alice',
        membershipStatus: 'ACTIVE', phone: '+971500000001',
      });
      mockPrisma.checkIn.findFirst.mockResolvedValue(null); // no recent dedupe
      mockPrisma.booking.findFirst.mockResolvedValue(null); // no nearby booking to link
      mockPrisma.$transaction.mockImplementation(async (fn: any) => {
        return fn({
          checkIn: { create: vi.fn().mockResolvedValue({ id: 'ci-1', memberId: 'm1', source: 'MANUAL', checkedInAt: NOW }) },
          member: { update: vi.fn() },
          booking: { update: vi.fn() },
        });
      });

      const req = createReq({
        method: 'POST',
        body: { source: 'MANUAL', memberId: 'm1' },
      });
      const res = await checkinHandlers.POST(req as any);
      expect(res.status).toBe(201);
    });

    it('creates a check-in by phone number', async () => {
      mockPrisma.member.findFirst
        .mockResolvedValueOnce({ id: 'm1', phone: '+971501234567', membershipStatus: 'ACTIVE' }) // by normalized
        .mockResolvedValueOnce(null); // fallback search
      mockPrisma.checkIn.findFirst.mockResolvedValue(null);
      mockPrisma.booking.findFirst.mockResolvedValue(null);
      mockPrisma.$transaction.mockImplementation(async (fn: any) => {
        return fn({
          checkIn: { create: vi.fn().mockResolvedValue({ id: 'ci-2', source: 'KIOSK_PIN', checkedInAt: NOW }) },
          member: { update: vi.fn() },
          booking: { update: vi.fn() },
        });
      });

      const req = createReq({
        method: 'POST',
        body: { source: 'KIOSK_PIN', phone: '+971501234567' },
      });
      const res = await checkinHandlers.POST(req as any);
      expect(res.status).toBe(201);
    });

    it('returns 404 when member not found', async () => {
      mockPrisma.member.findFirst.mockResolvedValue(null);

      const req = createReq({ method: 'POST', body: { source: 'MANUAL', memberId: 'ghost' } });
      const res = await checkinHandlers.POST(req as any);
      const body = await jsonBody(res);

      expect(res.status).toBe(404);
      expect(body).toMatchObject({ message: 'Member not found' });
    });

    it('returns 400 when member membership is cancelled', async () => {
      mockPrisma.member.findFirst.mockResolvedValue({
        id: 'm1', tenantId: MOCK_USER.tenantId, membershipStatus: 'CANCELLED',
      });

      const req = createReq({ method: 'POST', body: { source: 'MANUAL', memberId: 'm1' } });
      const res = await checkinHandlers.POST(req as any);
      const body = await jsonBody(res);

      expect(res.status).toBe(400);
      expect((body as any).message).toContain('CANCELLED');
    });

    it('returns 409 for duplicate check-in within dedupe window', async () => {
      mockPrisma.member.findFirst.mockResolvedValue({
        id: 'm1', tenantId: MOCK_USER.tenantId, membershipStatus: 'ACTIVE',
      });
      mockPrisma.checkIn.findFirst.mockResolvedValue({ id: 'ci-1', checkedInAt: new Date() }); // recent

      const req = createReq({ method: 'POST', body: { source: 'MANUAL', memberId: 'm1' } });
      const res = await checkinHandlers.POST(req as any);
      const body = await jsonBody(res);

      expect(res.status).toBe(409);
      expect((body as any).message).toContain('Duplicate check-in');
    });

    it('links check-in to nearby booking automatically', async () => {
      mockPrisma.member.findFirst.mockResolvedValue({
        id: 'm1', tenantId: MOCK_USER.tenantId, membershipStatus: 'ACTIVE',
      });
      mockPrisma.checkIn.findFirst.mockResolvedValue(null); // no dedupe
      mockPrisma.booking.findFirst.mockResolvedValue({
        id: 'bk-1', sessionId: 'sess-1', status: 'BOOKED',
        session: { id: 'sess-1', startsAt: new Date() },
      });
      mockPrisma.$transaction.mockImplementation(async (fn: any) => {
        return fn({
          checkIn: { create: vi.fn().mockResolvedValue({ id: 'ci-3', sessionId: 'sess-1', checkedInAt: NOW }) },
          member: { update: vi.fn() },
          booking: { update: vi.fn() },
        });
      });

      const req = createReq({ method: 'POST', body: { source: 'MANUAL', memberId: 'm1' } });
      const res = await checkinHandlers.POST(req as any);
      expect(res.status).toBe(201);
    });
  });

  describe('GET /api/checkins — List', () => {
    it('returns check-ins filtered by date range', async () => {
      mockPrisma.checkIn.findMany.mockResolvedValue([
        { id: 'ci-1', memberId: 'm1', source: 'MANUAL', checkedInAt: NOW },
        { id: 'ci-2', memberId: 'm2', source: 'KIOSK_PIN', checkedInAt: NOW },
      ]);
      const req = createReq({ searchParams: { from: '2026-06-01', to: '2026-06-03' } });
      const res = await checkinHandlers.GET(req as any);
      const body = (await jsonBody(res)) as any[];
      expect(res.status).toBe(200);
      expect(body).toHaveLength(2);
    });
  });
});

/* ------------------------------------------------------------------ */
/* Billing Tests                                                       */
/* ------------------------------------------------------------------ */
describe('Billing API', () => {
  beforeEach(() => vi.clearAllMocks());

  describe('Invoices', () => {
    it('GET /api/billing/invoices — lists invoices with filters', async () => {
      mockPrisma.invoice.findMany.mockResolvedValue([
        {
          id: 'inv-1', memberId: 'm1', amountAed: 25000, vatAed: 1250, status: 'DUE',
          dueDate: new Date('2026-06-15'), description: 'Gold Plan — June 2026',
          member: { id: 'm1', fullName: 'Alice', phone: '+971...' },
          attempts: [],
        },
      ]);
      mockPrisma.invoice.count.mockResolvedValue(1);
      const req = createReq({ searchParams: { status: 'DUE' } });
      const res = await invoiceHandlers.GET(req as any);
      const body = (await jsonBody(res)) as any;
      expect(res.status).toBe(200);
      expect(body.items).toHaveLength(1);
    });

    it('GET /api/billing/invoices/[id] — returns single invoice', async () => {
      mockPrisma.invoice.findFirst.mockResolvedValue({
        id: 'inv-1', memberId: 'm1', amountAed: 25000, status: 'DUE',
        member: { id: 'm1', fullName: 'Alice' },
        attempts: [],
      });
      const req = createReq();
      const res = await invoiceIdHandlers.GET(req as any, { params: Promise.resolve({ id: 'inv-1' }) });
      expect(res.status).toBe(200);
    });

    it('POST /api/billing/invoices/[id]/void — voids an invoice', async () => {
      mockPrisma.invoice.findFirst.mockResolvedValue({ id: 'inv-1', tenantId: MOCK_USER.tenantId, status: 'DUE' });
      mockPrisma.invoice.update.mockResolvedValue({ id: 'inv-1', status: 'WRITTEN_OFF' });
      const req = createReq({ method: 'POST' });
      const res = await invoiceVoidHandlers.POST(req as any, { params: Promise.resolve({ id: 'inv-1' }) });
      expect(res.status).toBe(200);
    });

    it('POST /api/billing/invoices/[id]/write-off — writes off an invoice', async () => {
      mockPrisma.invoice.findFirst.mockResolvedValue({ id: 'inv-1', tenantId: MOCK_USER.tenantId, status: 'FAILED' });
      mockPrisma.invoice.update.mockResolvedValue({ id: 'inv-1', status: 'WRITTEN_OFF' });
      const req = createReq({ method: 'POST', body: { reason: 'Member unreachable after 3 attempts' } });
      const res = await invoiceWriteOffHandlers.POST(req as any, { params: Promise.resolve({ id: 'inv-1' }) });
      expect(res.status).toBe(200);
    });

    it('POST /api/billing/invoices/[id]/void — returns 400 for already paid', async () => {
      mockPrisma.invoice.findFirst.mockResolvedValue({ id: 'inv-1', tenantId: MOCK_USER.tenantId, status: 'PAID' });
      const req = createReq({ method: 'POST' });
      const res = await invoiceVoidHandlers.POST(req as any, { params: Promise.resolve({ id: 'inv-1' }) });
      expect(res.status).toBe(400);
    });
  });

  describe('Billing Process', () => {
    it('POST /api/billing/process — triggers billing run', async () => {
      mockPrisma.invoice.findMany.mockResolvedValue([]);
      const req = createReq({ method: 'POST' });
      const res = await billingProcessHandlers.POST(req as any);
      expect(res.status).toBe(200);
    });
  });

  describe('Salary Window', () => {
    it('GET /api/billing/salary-window — returns salary window config', async () => {
      mockPrisma.salaryWindow.findFirst.mockResolvedValue({
        id: 'sw-1', tenantId: MOCK_USER.tenantId, startDay: 25, endDay: 28,
        timezone: 'Asia/Dubai', jitterMinutes: 120,
      });
      const req = createReq();
      const res = await salaryWindowHandlers.GET(req as any);
      const body = await jsonBody(res);
      expect(res.status).toBe(200);
      expect(body).toMatchObject({ startDay: 25, endDay: 28 });
    });

    it('POST /api/billing/salary-window — saves salary window config', async () => {
      mockPrisma.salaryWindow.upsert.mockResolvedValue({
        id: 'sw-1', tenantId: MOCK_USER.tenantId, startDay: 25, endDay: 28,
        timezone: 'Asia/Dubai', jitterMinutes: 120,
      });
      const req = createReq({
        method: 'POST',
        body: { startDay: 25, endDay: 28, timezone: 'Asia/Dubai', jitterMinutes: 120 },
      });
      const res = await salaryWindowHandlers.POST(req as any);
      expect(res.status).toBe(200);
    });
  });
});

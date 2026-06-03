/**
 * Check-Ins API — Complete Lifecycle & Edge-Case Tests
 *
 * Covers: Manual check-in → by phone → by memberId → deduplication →
 *         cancelled member rejection → class session check-in →
 *         staff-attributed check-in → pin auth → listing with pagination
 */
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { MOCK_USER, createReq, jsonBody, NOW } from './test-helpers';

/* ------------------------------------------------------------------ */
/* Mock prisma                                                        */
/* ------------------------------------------------------------------ */
const mockPrisma = {
  checkIn: {
    findMany: vi.fn(),
    findFirst: vi.fn(),
    create: vi.fn(),
    count: vi.fn(),
  },
  member: {
    findFirst: vi.fn(),
    update: vi.fn(),
  },
  memberQrToken: {
    findFirst: vi.fn(),
  },
  staff: {
    findFirst: vi.fn(),
  },
  booking: {
    findFirst: vi.fn(),
    update: vi.fn(),
  },
  classSession: {
    findFirst: vi.fn(),
  },
  $transaction: vi.fn((fn: any) => fn(mockPrisma)),
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

const checkinHandlers = await import('../../api/checkins/route');
const checkinByCodeHandlers = await import('../../api/checkins/by-code/route');

/* ------------------------------------------------------------------ */
/* Tests                                                              */
/* ------------------------------------------------------------------ */
describe('Check-Ins API — Complete', () => {
  beforeEach(() => vi.clearAllMocks());

  /* ─────── LIST Check-ins ─────── */
  describe('GET /api/checkins — List', () => {
    it('returns latest check-ins with member info', async () => {
      mockPrisma.checkIn.findMany.mockResolvedValue([
        {
          id: 'ci-1', memberId: 'mem-1', source: 'KIOSK', checkedInAt: NOW,
          staffId: null, sessionId: null,
          member: { id: 'mem-1', fullName: 'Ahmed Al Mansoori' },
        },
        {
          id: 'ci-2', memberId: 'mem-2', source: 'QR', checkedInAt: NOW,
          staffId: 'st-1', sessionId: 'sess-1',
          member: { id: 'mem-2', fullName: 'Sara Khalid' },
        },
      ]);

      const req = createReq();
      const res = await checkinHandlers.GET(req as any);
      const body: any = await jsonBody(res);

      expect(res.status).toBe(200);
      expect(Array.isArray(body)).toBe(true);
      expect(body).toHaveLength(2);
      expect(body[0].id).toBe('ci-1');
      expect(body[0].source).toBe('KIOSK');
    });

    it('returns empty array when no check-ins exist', async () => {
      mockPrisma.checkIn.findMany.mockResolvedValue([]);

      const req = createReq();
      const res = await checkinHandlers.GET(req as any);
      const body = await jsonBody(res);

      expect(res.status).toBe(200);
      expect(body).toEqual([]);
    });

    it('limits to latest 200 check-ins and includes member name', async () => {
      mockPrisma.checkIn.findMany.mockResolvedValue([]);

      const req = createReq();
      await checkinHandlers.GET(req as any);

      expect(mockPrisma.checkIn.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          take: 200,
          include: { member: { select: { id: true, fullName: true } } },
        }),
      );
    });

    it('orders by checkedInAt descending', async () => {
      mockPrisma.checkIn.findMany.mockResolvedValue([]);

      const req = createReq();
      await checkinHandlers.GET(req as any);

      expect(mockPrisma.checkIn.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          orderBy: { checkedInAt: 'desc' },
        }),
      );
    });
  });

  /* ─────── CREATE Manual Check-in ─────── */
  describe('POST /api/checkins — Manual Check-in', () => {
    it('creates a manual check-in for an active member', async () => {
      mockPrisma.member.findFirst.mockResolvedValue({
        id: 'mem-1', fullName: 'Ahmed', tenantId: MOCK_USER.tenantId,
        membershipStatus: 'ACTIVE',
      });
      // Dedupe check — no recent checkin
      mockPrisma.checkIn.findFirst.mockResolvedValue(null);
      mockPrisma.booking.findFirst.mockResolvedValue(null);
      mockPrisma.checkIn.create.mockResolvedValue({
        id: 'ci-new', memberId: 'mem-1', source: 'MANUAL',
        checkedInAt: NOW, staffId: null, sessionId: null,
      });

      const req = createReq({
        method: 'POST',
        body: { source: 'MANUAL', memberId: 'mem-1' },
      });
      const res = await checkinHandlers.POST(req as any);
      const body = await jsonBody(res);

      expect(res.status).toBe(201);
      expect(body).toMatchObject({ memberId: 'mem-1', source: 'MANUAL' });
    });

    it('creates check-in with staff attribution', async () => {
      mockPrisma.member.findFirst.mockResolvedValue({
        id: 'mem-1', fullName: 'Ahmed', tenantId: MOCK_USER.tenantId,
        membershipStatus: 'ACTIVE',
      });
      mockPrisma.staff.findFirst.mockResolvedValue({
        id: 'st-1', fullName: 'Coach Ahmed', tenantId: MOCK_USER.tenantId, active: true,
      });
      mockPrisma.checkIn.findFirst.mockResolvedValue(null); // no recent checkin
      mockPrisma.booking.findFirst.mockResolvedValue(null);
      mockPrisma.checkIn.create.mockResolvedValue({
        id: 'ci-staff', memberId: 'mem-1', source: 'MANUAL',
        checkedInAt: NOW, staffId: 'st-1', sessionId: null,
      });

      const req = createReq({
        method: 'POST',
        body: { source: 'MANUAL', memberId: 'mem-1', staffId: 'st-1' },
      });
      const res = await checkinHandlers.POST(req as any);
      const body = await jsonBody(res);

      expect(res.status).toBe(201);
      expect(body.staffId).toBe('st-1');
    });

    it('returns 400 when required fields are missing', async () => {
      const req = createReq({
        method: 'POST',
        body: {},
      });
      const res = await checkinHandlers.POST(req as any);
      expect(res.status).toBe(400);
    });

    it('returns 404 when member not found', async () => {
      mockPrisma.member.findFirst.mockResolvedValue(null);

      const req = createReq({
        method: 'POST',
        body: { source: 'MANUAL', memberId: 'ghost' },
      });
      const res = await checkinHandlers.POST(req as any);
      const body = await jsonBody(res);

      expect(res.status).toBe(404);
      expect(body).toMatchObject({ message: 'Member not found' });
    });

    it('rejects check-in for cancelled members', async () => {
      mockPrisma.member.findFirst.mockResolvedValue({
        id: 'mem-cancelled', fullName: 'Ex-Member', tenantId: MOCK_USER.tenantId,
        membershipStatus: 'CANCELLED',
      });

      const req = createReq({
        method: 'POST',
        body: { source: 'MANUAL', memberId: 'mem-cancelled' },
      });
      const res = await checkinHandlers.POST(req as any);
      const body = await jsonBody(res);

      expect(res.status).toBe(400);
      expect(body.message).toContain('CANCELLED');
    });

    it('rejects check-in for expired members', async () => {
      mockPrisma.member.findFirst.mockResolvedValue({
        id: 'mem-expired', fullName: 'Old Member', tenantId: MOCK_USER.tenantId,
        membershipStatus: 'EXPIRED',
      });

      const req = createReq({
        method: 'POST',
        body: { source: 'MANUAL', memberId: 'mem-expired' },
      });
      const res = await checkinHandlers.POST(req as any);

      expect(res.status).toBe(400);
    });

    it('deduplicates — prevents double check-in within time window', async () => {
      mockPrisma.member.findFirst.mockResolvedValue({
        id: 'mem-1', fullName: 'Ahmed', tenantId: MOCK_USER.tenantId,
        membershipStatus: 'ACTIVE',
      });
      // Member already checked in recently
      mockPrisma.checkIn.findFirst.mockResolvedValue({
        id: 'ci-existing', memberId: 'mem-1', checkedInAt: NOW,
      });

      const req = createReq({
        method: 'POST',
        body: { source: 'MANUAL', memberId: 'mem-1' },
      });
      const res = await checkinHandlers.POST(req as any);
      const body = await jsonBody(res);

      expect(res.status).toBe(409);
      expect(body.message).toContain('Duplicate check-in');
    });

    it('auto-links a nearby class booking on check-in', async () => {
      mockPrisma.member.findFirst.mockResolvedValue({
        id: 'mem-1', fullName: 'Ahmed', tenantId: MOCK_USER.tenantId,
        membershipStatus: 'ACTIVE',
      });
      mockPrisma.checkIn.findFirst.mockResolvedValue(null); // no dedupe
      mockPrisma.booking.findFirst.mockResolvedValue({
        id: 'bk-1', memberId: 'mem-1', sessionId: 'sess-1', status: 'BOOKED',
        session: { id: 'sess-1', startsAt: NOW },
      });
      mockPrisma.checkIn.create.mockResolvedValue({
        id: 'ci-class', memberId: 'mem-1', source: 'MANUAL',
        checkedInAt: NOW, staffId: null, sessionId: 'sess-1',
      });

      const req = createReq({
        method: 'POST',
        body: { source: 'MANUAL', memberId: 'mem-1' },
      });
      const res = await checkinHandlers.POST(req as any);
      const body = await jsonBody(res);

      expect(res.status).toBe(201);
      expect(body.sessionId).toBe('sess-1');
    });
  });

  /* ─────── Check-in by Code (Class session checkin code) ─────── */
  describe('POST /api/checkins/by-code — Code-based Check-in', () => {
    it('checks in a member by class code + phone', async () => {
      mockPrisma.classSession.findFirst.mockResolvedValue({
        id: 'sess-1', startsAt: NOW, status: 'SCHEDULED',
      });
      mockPrisma.member.findFirst.mockResolvedValue({
        id: 'mem-1', fullName: 'Ahmed', tenantId: MOCK_USER.tenantId,
        membershipStatus: 'ACTIVE', phone: '+971501234567',
      });
      mockPrisma.checkIn.findFirst.mockResolvedValue(null); // no dedupe
      mockPrisma.checkIn.create.mockResolvedValue({
        id: 'ci-code', memberId: 'mem-1', source: 'MOBILE_QR',
        checkedInAt: NOW, staffId: null, sessionId: 'sess-1',
      });

      const req = createReq({
        method: 'POST',
        body: { code: 'CLS-123', phone: '+971501234567' },
      });
      const res = await checkinByCodeHandlers.POST(req as any);
      const body = await jsonBody(res);

      expect(res.status).toBe(201);
      expect(body.source).toBe('MOBILE_QR');
    });

    it('returns 400 when code is missing', async () => {
      const req = createReq({ method: 'POST', body: { phone: '+971501234567' } });
      const res = await checkinByCodeHandlers.POST(req as any);
      expect(res.status).toBe(400);
    });

    it('returns 400 when phone is missing', async () => {
      const req = createReq({ method: 'POST', body: { code: 'CLS-123' } });
      const res = await checkinByCodeHandlers.POST(req as any);
      expect(res.status).toBe(400);
    });

    it('returns 404 when checkin code is invalid', async () => {
      mockPrisma.classSession.findFirst.mockResolvedValue(null);

      const req = createReq({
        method: 'POST',
        body: { code: 'invalid-code', phone: '+971501234567' },
      });
      const res = await checkinByCodeHandlers.POST(req as any);
      const body = await jsonBody(res);

      expect(res.status).toBe(404);
      expect(body.message).toContain('Invalid check-in code');
    });
  });
});

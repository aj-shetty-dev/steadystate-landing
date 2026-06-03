/**
 * Members API — End-to-End Flow Tests
 *
 * Covers: Create member → Read member → List members → Update member →
 *         Deactivate member → Edge cases (duplicate phone, not found, validation)
 */
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { MOCK_USER, createReq, jsonBody, NOW } from './test-helpers';

/* ------------------------------------------------------------------ */
/* Mock prisma                                                        */
/* ------------------------------------------------------------------ */
const mockPrisma = {
  member: {
    findMany: vi.fn(),
    findFirst: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
    count: vi.fn(),
  },
  membership: {
    findMany: vi.fn(),
    updateMany: vi.fn(),
  },
  booking: {
    updateMany: vi.fn(),
  },
  $transaction: vi.fn((fn: any) => fn(mockPrisma)),
};

vi.mock('@/lib/prisma', () => ({ prisma: mockPrisma }));

vi.mock("@/lib/auth-server", () => ({
  requireServerUser: vi.fn().mockResolvedValue({ id: "user-1", email: "owner@testgym.ae", fullName: "Test Owner", tenantId: "tenant-1", role: "OWNER" }),
  requireTenantId: vi.fn().mockResolvedValue("tenant-1"),
  getServerUser: vi.fn().mockResolvedValue({ id: "user-1", email: "owner@testgym.ae", fullName: "Test Owner", tenantId: "tenant-1", role: "OWNER" }),
}));

/* Import handlers AFTER mocks are set up */
const handlers = await import('../../api/members/route');
const idHandlers = await import('../../api/members/[id]/route');
const deactivateHandlers = await import('../../api/members/[id]/deactivate/route');

/* ------------------------------------------------------------------ */
/* Tests                                                              */
/* ------------------------------------------------------------------ */
describe('Members API — Full Lifecycle', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  /* ─────── CREATE Member ─────── */
  describe('POST /api/members — Create', () => {
    it('creates a member with required fields and returns 201', async () => {
      const createdMember = {
        id: 'mem-1',
        tenantId: MOCK_USER.tenantId,
        externalId: 'ext-uuid',
        provider: 'NATIVE',
        source: 'MANUAL',
        fullName: 'Ahmed Al Mansoori',
        phone: '+971501234567',
        email: 'ahmed@example.com',
        membershipStatus: 'ACTIVE',
        joinedAt: NOW,
        preferredLocale: 'EN',
        gender: null,
        dateOfBirth: null,
        medicalNotes: null,
        emergencyContact: null,
        assignedTrainerId: null,
        raw: {},
      };

      mockPrisma.member.findFirst.mockResolvedValue(null); // no phone duplicate
      mockPrisma.member.create.mockResolvedValue(createdMember);

      const req = createReq({
        method: 'POST',
        body: {
          fullName: 'Ahmed Al Mansoori',
          phone: '+971501234567',
          email: 'ahmed@example.com',
          membershipStatus: 'ACTIVE',
        },
      });

      const res = await handlers.POST(req as any);
      const body = await jsonBody(res);

      expect(res.status).toBe(201);
      expect(body).toMatchObject({ fullName: 'Ahmed Al Mansoori', phone: '+971501234567' });
      expect(mockPrisma.member.create).toHaveBeenCalledTimes(1);
    });

    it('returns 409 when a member with the same phone already exists', async () => {
      mockPrisma.member.findFirst.mockResolvedValue({ id: 'existing-id' });

      const req = createReq({
        method: 'POST',
        body: { fullName: 'Duplicate', phone: '+971501234567', membershipStatus: 'ACTIVE' },
      });

      const res = await handlers.POST(req as any);
      const body = await jsonBody(res);

      expect(res.status).toBe(409);
      expect(body).toMatchObject({ message: 'A member with this phone number already exists' });
    });

    it('creates a member without phone (no duplicate check needed)', async () => {
      mockPrisma.member.create.mockResolvedValue({
        id: 'mem-2',
        fullName: 'Sara No Phone',
        phone: null,
        email: 'sara@example.com',
        membershipStatus: 'ACTIVE',
      });

      const req = createReq({
        method: 'POST',
        body: { fullName: 'Sara No Phone', membershipStatus: 'ACTIVE' },
      });

      const res = await handlers.POST(req as any);
      expect(res.status).toBe(201);
    });
  });

  /* ─────── READ / LIST Members ─────── */
  describe('GET /api/members — List', () => {
    it('returns paginated member list with active plan names', async () => {
      const members = [
        { id: 'm1', fullName: 'Alice', email: 'alice@test.com', phone: '+971500000001', membershipStatus: 'ACTIVE', provider: 'NATIVE', lastCheckinAt: NOW, joinedAt: NOW },
        { id: 'm2', fullName: 'Bob', email: 'bob@test.com', phone: '+971500000002', membershipStatus: 'ACTIVE', provider: 'NATIVE', lastCheckinAt: null, joinedAt: NOW },
      ];

      mockPrisma.member.findMany.mockResolvedValue(members);
      mockPrisma.member.count.mockResolvedValue(2);
      mockPrisma.membership.findMany.mockResolvedValue([
        { memberId: 'm1', plan: { nameEn: 'Gold Plan' } },
      ]);

      const req = createReq({ searchParams: { page: '1', pageSize: '25' } });
      const res = await handlers.GET(req as any);
      const body = (await jsonBody(res)) as any;

      expect(res.status).toBe(200);
      expect(body.items).toHaveLength(2);
      expect(body.total).toBe(2);
      expect(body.items[0].activePlanNames).toEqual(['Gold Plan']);
      expect(body.items[1].activePlanNames).toEqual([]);
    });

    it('filters by status when status param is provided', async () => {
      mockPrisma.member.findMany.mockResolvedValue([]);
      mockPrisma.member.count.mockResolvedValue(0);
      mockPrisma.membership.findMany.mockResolvedValue([]);

      const req = createReq({ searchParams: { status: 'FROZEN' } });
      await handlers.GET(req as any);

      const whereArg = mockPrisma.member.findMany.mock.calls[0][0].where;
      expect(whereArg.membershipStatus).toBe('FROZEN');
    });

    it('filters by search term across name, email, and phone', async () => {
      mockPrisma.member.findMany.mockResolvedValue([]);
      mockPrisma.member.count.mockResolvedValue(0);
      mockPrisma.membership.findMany.mockResolvedValue([]);

      const req = createReq({ searchParams: { search: 'ahmed' } });
      await handlers.GET(req as any);

      const whereArg = mockPrisma.member.findMany.mock.calls[0][0].where;
      expect(whereArg.OR).toBeDefined();
    });
  });

  /* ─────── GET single member ─────── */
  describe('GET /api/members/[id] — Read single', () => {
    it('returns member detail with active plan names', async () => {
      const member = {
        id: 'm1', fullName: 'Alice', email: 'alice@test.com', phone: '+971500000001',
        membershipStatus: 'ACTIVE', membershipExpiresAt: null, provider: 'NATIVE',
        lastCheckinAt: NOW, joinedAt: NOW, externalId: 'ext-1', preferredLocale: 'EN',
        medicalNotes: null, dateOfBirth: null, gender: null, source: 'MANUAL',
        emergencyContact: null, assignedTrainerId: null,
      };

      mockPrisma.member.findFirst.mockResolvedValue(member);
      mockPrisma.membership.findMany.mockResolvedValue([
        { plan: { nameEn: 'Gold Plan' } },
        { plan: { nameEn: 'Silver Plan' } },
      ]);

      const req = createReq();
      const res = await idHandlers.GET(req as any, { params: Promise.resolve({ id: 'm1' }) });
      const body = (await jsonBody(res)) as any;

      expect(res.status).toBe(200);
      expect(body.fullName).toBe('Alice');
      expect(body.activePlanNames).toEqual(['Gold Plan', 'Silver Plan']);
    });

    it('returns 404 when member not found', async () => {
      mockPrisma.member.findFirst.mockResolvedValue(null);

      const req = createReq();
      const res = await idHandlers.GET(req as any, { params: Promise.resolve({ id: 'not-exists' }) });
      const body = await jsonBody(res);

      expect(res.status).toBe(404);
      expect(body).toMatchObject({ message: 'Member not found' });
    });
  });

  /* ─────── UPDATE Member ─────── */
  describe('PATCH /api/members/[id] — Update', () => {
    it('updates member fields and returns updated member', async () => {
      const existing = { id: 'm1', tenantId: MOCK_USER.tenantId, phone: '+971500000001' };
      const updated = { ...existing, fullName: 'Alice Updated', email: 'new@test.com', phone: '+971500000002' };

      mockPrisma.member.findFirst.mockResolvedValue(existing);
      mockPrisma.member.update.mockResolvedValue(updated);

      const req = createReq({
        method: 'PATCH',
        body: { fullName: 'Alice Updated', email: 'new@test.com' },
      });
      const res = await idHandlers.PATCH(req as any, { params: Promise.resolve({ id: 'm1' }) });
      const body = await jsonBody(res);

      expect(res.status).toBe(200);
      expect(body).toMatchObject({ fullName: 'Alice Updated', email: 'new@test.com' });
    });

    it('returns 404 when updating non-existent member', async () => {
      mockPrisma.member.findFirst.mockResolvedValue(null);

      const req = createReq({ method: 'PATCH', body: { fullName: 'Ghost' } });
      const res = await idHandlers.PATCH(req as any, { params: Promise.resolve({ id: 'not-exists' }) });
      const body = await jsonBody(res);

      expect(res.status).toBe(404);
      expect(body).toMatchObject({ message: 'Member not found' });
    });

    it('returns 409 when updating phone to one already in use', async () => {
      mockPrisma.member.findFirst
        .mockResolvedValueOnce({ id: 'm1', tenantId: MOCK_USER.tenantId, phone: 'old' }) // existing
        .mockResolvedValueOnce({ id: 'm2' }); // duplicate check finds another

      const req = createReq({ method: 'PATCH', body: { phone: '+971501234567' } });
      const res = await idHandlers.PATCH(req as any, { params: Promise.resolve({ id: 'm1' }) });
      const body = await jsonBody(res);

      expect(res.status).toBe(409);
      expect(body).toMatchObject({ message: 'A member with this phone number already exists' });
    });
  });

  /* ─────── DEACTIVATE Member ─────── */
  describe('POST /api/members/[id]/deactivate — Deactivate', () => {
    it('deactivates an active member', async () => {
      mockPrisma.member.findFirst.mockResolvedValue({
        id: 'm1', tenantId: MOCK_USER.tenantId, membershipStatus: 'ACTIVE',
      });
      mockPrisma.member.update.mockResolvedValue({
        id: 'm1', membershipStatus: 'CANCELLED',
      });

      const req = createReq({ method: 'POST' });
      const res = await deactivateHandlers.POST(req as any, { params: Promise.resolve({ id: 'm1' }) });

      expect(res.status).toBe(200);
      expect(mockPrisma.member.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'm1' },
          data: expect.objectContaining({ membershipStatus: 'CANCELLED' }),
        }),
      );
    });

    it('returns 404 when member not found', async () => {
      mockPrisma.member.findFirst.mockResolvedValue(null);

      const req = createReq({ method: 'POST' });
      const res = await deactivateHandlers.POST(req as any, { params: Promise.resolve({ id: 'ghost' }) });
      const body = await jsonBody(res);

      expect(res.status).toBe(404);
      expect(body).toMatchObject({ message: 'Member not found' });
    });
  });
});

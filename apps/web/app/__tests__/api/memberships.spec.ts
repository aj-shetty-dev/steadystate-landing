/**
 * Memberships API — End-to-End Flow Tests
 *
 * Covers: Plans CRUD → Create membership → Freeze → Unfreeze → Cancel →
 *         Renewals → Edge cases (overlapping, inactive plan, not found)
 */
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { MOCK_USER, createReq, jsonBody, NOW } from './test-helpers';

/* ------------------------------------------------------------------ */
/* Mock prisma                                                        */
/* ------------------------------------------------------------------ */
const mockPrisma = {
  membershipPlan: { findMany: vi.fn(), findFirst: vi.fn(), create: vi.fn(), update: vi.fn() },
  membership: { findMany: vi.fn(), findFirst: vi.fn(), create: vi.fn(), update: vi.fn(), count: vi.fn() },
  membershipFreeze: { findMany: vi.fn(), findFirst: vi.fn(), create: vi.fn(), update: vi.fn() },
  member: { findFirst: vi.fn(), update: vi.fn() },
  $transaction: vi.fn((fn: any) => fn(mockPrisma)),
};

vi.mock('@/lib/prisma', () => ({ prisma: mockPrisma }));
vi.mock("@/lib/auth-server", () => ({
  requireServerUser: vi.fn().mockResolvedValue({ id: "user-1", email: "owner@testgym.ae", fullName: "Test Owner", tenantId: "tenant-1", role: "OWNER" }),
  requireTenantId: vi.fn().mockResolvedValue("tenant-1"),
  getServerUser: vi.fn().mockResolvedValue({ id: "user-1", email: "owner@testgym.ae", fullName: "Test Owner", tenantId: "tenant-1", role: "OWNER" }),
}));

/* Dynamic imports after mocks */
const planHandlers = await import('../../api/membership-plans/route');
const planIdHandlers = await import('../../api/membership-plans/[id]/route');
const membershipHandlers = await import('../../api/memberships/route');
const freezeHandlers = await import('../../api/memberships/[id]/freeze/route');
const unfreezeHandlers = await import('../../api/memberships/[id]/unfreeze/route');
const cancelHandlers = await import('../../api/memberships/[id]/cancel/route');
const renewalsHandlers = await import('../../api/memberships/renewals/route');

/* ------------------------------------------------------------------ */
/* Tests                                                              */
/* ------------------------------------------------------------------ */
describe('Membership Plans API', () => {
  beforeEach(() => vi.clearAllMocks());

  describe('POST /api/membership-plans — Create Plan', () => {
    it('creates a membership plan', async () => {
      mockPrisma.membershipPlan.create.mockResolvedValue({
        id: 'plan-1', tenantId: MOCK_USER.tenantId, nameEn: 'Gold Plan',
        priceAed: 2500, durationDays: 30, vatRate: 5, includesClasses: true,
        maxFreezeDays: 10, active: true,
      });

      const req = createReq({
        method: 'POST',
        body: { nameEn: 'Gold Plan', priceAed: 2500, durationDays: 30 },
      });
      const res = await planHandlers.POST(req as any);
      const body = await jsonBody(res);

      expect(res.status).toBe(201);
      expect(body).toMatchObject({ nameEn: 'Gold Plan', priceAed: 2500, durationDays: 30 });
    });

    it('returns 400 for invalid plan data', async () => {
      const req = createReq({ method: 'POST', body: { nameEn: '' } });
      const res = await planHandlers.POST(req as any);
      expect(res.status).toBe(400);
    });
  });

  describe('GET /api/membership-plans — List Plans', () => {
    it('returns active plans by default', async () => {
      mockPrisma.membershipPlan.findMany.mockResolvedValue([
        { id: 'p1', nameEn: 'Gold', priceAed: 2500, active: true },
      ]);

      const req = createReq();
      const res = await planHandlers.GET(req as any);
      const body = (await jsonBody(res)) as any[];

      expect(res.status).toBe(200);
      expect(body).toHaveLength(1);
    });
  });

  describe('PATCH /api/membership-plans/[id] — Update Plan', () => {
    it('updates a plan name and price', async () => {
      mockPrisma.membershipPlan.findFirst.mockResolvedValue({ id: 'plan-1' });
      mockPrisma.membershipPlan.update.mockResolvedValue({
        id: 'plan-1', nameEn: 'Platinum Plan', priceAed: 3500,
      });

      const req = createReq({
        method: 'PATCH',
        body: { nameEn: 'Platinum Plan', priceAed: 3500 },
      });
      const res = await planIdHandlers.PATCH(req as any, { params: Promise.resolve({ id: 'plan-1' }) });

      expect(res.status).toBe(200);
    });

    it('returns 404 when plan not found', async () => {
      mockPrisma.membershipPlan.findFirst.mockResolvedValue(null);

      const req = createReq({ method: 'PATCH', body: {} });
      const res = await planIdHandlers.PATCH(req as any, { params: Promise.resolve({ id: 'ghost' }) });

      expect(res.status).toBe(404);
    });
  });
});

describe('Memberships API — Full Lifecycle', () => {
  beforeEach(() => vi.clearAllMocks());

  describe('POST /api/memberships — Create Membership', () => {
    it('assigns a plan to a member', async () => {
      mockPrisma.member.findFirst.mockResolvedValue({ id: 'm1', fullName: 'Alice', phone: '+971...', preferredLocale: 'EN' });
      mockPrisma.membershipPlan.findFirst.mockResolvedValue({ id: 'plan-1', nameEn: 'Gold', durationDays: 30, priceAed: 2500, active: true });
      mockPrisma.membership.findFirst.mockResolvedValue(null); // no overlap
      mockPrisma.$transaction.mockImplementation(async (fn: any) => {
        const result = await fn({
          membership: {
            create: vi.fn().mockResolvedValue({ id: 'ms-1', memberId: 'm1', planId: 'plan-1', status: 'PENDING_PAYMENT', startDate: NOW, endDate: new Date('2026-07-03') }),
          },
          member: { update: vi.fn() },
        });
        return result;
      });

      const req = createReq({
        method: 'POST',
        body: { memberId: 'm1', planId: 'plan-1' },
      });

      // $transaction resolves to the return of the callback
      mockPrisma.$transaction.mockImplementation(async (fn: any) =>
        fn({ membership: { create: vi.fn().mockResolvedValue({ id: 'ms-1', memberId: 'm1', planId: 'plan-1', status: 'PENDING_PAYMENT', startDate: NOW, endDate: new Date('2026-07-03') }) }, member: { update: vi.fn() } }),
      );

      const res = await membershipHandlers.POST(req as any);
      expect([200, 201]).toContain(res.status);
    });

    it('returns 404 when member does not exist', async () => {
      mockPrisma.member.findFirst.mockResolvedValue(null);

      const req = createReq({ method: 'POST', body: { memberId: 'ghost', planId: 'plan-1' } });
      const res = await membershipHandlers.POST(req as any);
      const body = await jsonBody(res);

      expect(res.status).toBe(404);
      expect(body).toMatchObject({ message: 'Member not found' });
    });

    it('returns 404 when plan is inactive', async () => {
      mockPrisma.member.findFirst.mockResolvedValue({ id: 'm1' });
      mockPrisma.membershipPlan.findFirst.mockResolvedValue(null); // plan not found or inactive

      const req = createReq({ method: 'POST', body: { memberId: 'm1', planId: 'plan-1' } });
      const res = await membershipHandlers.POST(req as any);
      const body = await jsonBody(res);

      expect(res.status).toBe(404);
      expect(body).toMatchObject({ message: 'Plan not found or inactive' });
    });

    it('returns 409 for overlapping active membership', async () => {
      mockPrisma.member.findFirst.mockResolvedValue({ id: 'm1' });
      mockPrisma.membershipPlan.findFirst.mockResolvedValue({ id: 'plan-1', durationDays: 30, active: true });
      mockPrisma.membership.findFirst.mockResolvedValue({ id: 'existing-ms' }); // overlap

      const req = createReq({ method: 'POST', body: { memberId: 'm1', planId: 'plan-1' } });
      const res = await membershipHandlers.POST(req as any);
      const body = await jsonBody(res);

      expect(res.status).toBe(409);
      expect(body).toMatchObject({ message: 'Member already has an overlapping active or pending membership' });
    });
  });

  describe('GET /api/memberships — List', () => {
    it('returns paginated memberships with member and plan details', async () => {
      mockPrisma.membership.findMany.mockResolvedValue([
        {
          id: 'ms-1', memberId: 'm1', planId: 'plan-1', status: 'ACTIVE',
          startDate: NOW, endDate: new Date('2026-07-03'),
          member: { id: 'm1', fullName: 'Alice', phone: '+971...' },
          plan: { id: 'plan-1', nameEn: 'Gold', durationDays: 30, priceAed: 2500 },
        },
      ]);
      mockPrisma.membership.count.mockResolvedValue(1);

      const req = createReq({ searchParams: { status: 'ACTIVE' } });
      const res = await membershipHandlers.GET(req as any);
      const body = (await jsonBody(res)) as any;

      expect(res.status).toBe(200);
      expect(body.items).toHaveLength(1);
      expect(body.items[0].member.fullName).toBe('Alice');
      expect(body.items[0].plan.nameEn).toBe('Gold');
    });
  });

  describe('POST /api/memberships/[id]/freeze — Freeze Membership', () => {
    it('freezes an active membership', async () => {
      const membership = {
        id: 'ms-1', tenantId: MOCK_USER.tenantId, memberId: 'm1',
        planId: 'plan-1', status: 'ACTIVE',
        plan: { maxFreezeDays: 30 },
        freezes: [],
      };
      mockPrisma.membership.findFirst.mockResolvedValue(membership);
      mockPrisma.membershipFreeze.findMany.mockResolvedValue([]); // no active freezes
      mockPrisma.$transaction.mockImplementation(async (fn: any) => fn({
        membership: { update: vi.fn() },
        membershipFreeze: { create: vi.fn().mockResolvedValue({ id: 'fz-1' }) },
        member: { update: vi.fn() },
      }));

      const req = createReq({
        method: 'POST',
        body: { startDate: '2026-06-05T00:00:00.000Z', endDate: '2026-06-12T00:00:00.000Z' },
      });
      const res = await freezeHandlers.POST(req as any, { params: Promise.resolve({ id: 'ms-1' }) });

      expect(res.status).toBe(200);
    });

    it('returns 404 when membership not found', async () => {
      mockPrisma.membership.findFirst.mockResolvedValue(null);

      const req = createReq({ method: 'POST', body: { startDate: '2026-06-05T00:00:00.000Z', endDate: '2026-06-12T00:00:00.000Z' } });
      const res = await freezeHandlers.POST(req as any, { params: Promise.resolve({ id: 'ghost' }) });
      expect(res.status).toBe(404);
    });
  });

  describe('POST /api/memberships/[id]/unfreeze — Unfreeze', () => {
    it('unfreezes a frozen membership', async () => {
      mockPrisma.membership.findFirst.mockResolvedValue({
        id: 'ms-1', tenantId: MOCK_USER.tenantId, status: 'FROZEN', frozenUntil: new Date('2026-06-12'),
        freezes: [{ id: 'fz-1', status: 'ACTIVE', endDate: new Date('2026-06-12') }],
      });
      mockPrisma.$transaction.mockImplementation(async (fn: any) => fn({
        membership: { update: vi.fn() },
        membershipFreeze: { update: vi.fn() },
        member: { update: vi.fn() },
      }));

      const req = createReq({ method: 'POST' });
      const res = await unfreezeHandlers.POST(req as any, { params: Promise.resolve({ id: 'ms-1' }) });

      expect(res.status).toBe(200);
    });
  });

  describe('POST /api/memberships/[id]/cancel — Cancel', () => {
    it('cancels a membership', async () => {
      mockPrisma.membership.findFirst.mockResolvedValue({
        id: 'ms-1', tenantId: MOCK_USER.tenantId, status: 'ACTIVE', memberId: 'm1',
      });
      mockPrisma.membership.update.mockResolvedValue({ id: 'ms-1', status: 'CANCELLED' });

      const req = createReq({ method: 'POST', body: { reason: 'Member requested cancellation' } });
      const res = await cancelHandlers.POST(req as any, { params: Promise.resolve({ id: 'ms-1' }) });

      expect(res.status).toBe(200);
    });
  });

  describe('GET /api/memberships/renewals — Upcoming Renewals', () => {
    it('returns memberships expiring within range', async () => {
      mockPrisma.membership.findMany.mockResolvedValue([
        {
          id: 'ms-1', memberId: 'm1', planId: 'plan-1', status: 'ACTIVE',
          startDate: NOW, endDate: new Date('2026-06-10'),
          member: { id: 'm1', fullName: 'Alice', phone: '+971...' },
          plan: { id: 'plan-1', nameEn: 'Gold', priceAed: 2500, durationDays: 30 },
        },
      ]);

      const req = createReq({ searchParams: { days: '7' } });
      const res = await renewalsHandlers.GET(req as any);
      const body = (await jsonBody(res)) as any[];

      expect(res.status).toBe(200);
      expect(body).toHaveLength(1);
    });
  });
});

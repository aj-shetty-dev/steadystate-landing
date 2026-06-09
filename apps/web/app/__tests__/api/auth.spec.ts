/**
 * Auth API — End-to-End Tests
 *
 * Covers: GET /api/auth/me (current user), POST /api/auth/onboard (tenant creation).
 */
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { MOCK_USER, createReq, jsonBody } from './test-helpers';

/* ------------------------------------------------------------------ */
/* Hoisted mocks                                                      */
/* ------------------------------------------------------------------ */
const { mockPrisma, mockRequireServerUser, mockClerkAuth, mockClerkCurrentUser, mockClerkUpdateUser, mockClerkClient } = vi.hoisted(() => {
  const prisma = {
    tenant: { create: vi.fn() },
    user: { create: vi.fn() },
    subscription: { create: vi.fn() },
    $transaction: vi.fn((fn: any) => fn(prisma)),
  };
  return {
    mockPrisma: prisma,
    mockRequireServerUser: vi.fn(),
    mockClerkAuth: vi.fn(),
    mockClerkCurrentUser: vi.fn(),
    mockClerkUpdateUser: vi.fn(),
    mockClerkClient: vi.fn(),
  };
});

vi.mock('@/lib/prisma', () => ({ prisma: mockPrisma }));

// Mock auth-server for /api/auth/me tests
vi.mock('@/lib/auth-server', () => ({
  requireServerUser: mockRequireServerUser,
  requireTenantId: vi.fn().mockResolvedValue(MOCK_USER.tenantId),
  getServerUser: vi.fn(),
}));

// Mock Clerk for /api/auth/onboard tests
vi.mock('@clerk/nextjs/server', () => ({
  auth: mockClerkAuth,
  currentUser: mockClerkCurrentUser,
  clerkClient: mockClerkClient,
}));

/* Import handlers AFTER mocks */
const meHandlers = await import('../../api/auth/me/route');
const onboardHandlers = await import('../../api/auth/onboard/route');

/* ------------------------------------------------------------------ */
/* Tests                                                              */
/* ------------------------------------------------------------------ */
describe('Auth API', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  /* ─────────────────────────────────────────────────────────────── */
  /* GET /api/auth/me                                                */
  /* ─────────────────────────────────────────────────────────────── */
  describe('GET /api/auth/me', () => {
    it('returns the authenticated user pass-through from requireServerUser', async () => {
      // The /api/auth/me route is a thin pass-through — it returns
      // whatever requireServerUser returns. Test the OWNER case.
      mockRequireServerUser.mockResolvedValue({
        id: 'user-1',
        email: 'owner@testgym.ae',
        fullName: 'Test Owner',
        tenantId: 'tenant-1',
        role: 'OWNER',
      });

      const req = createReq();
      const res = await meHandlers.GET(req as any);
      const body = await jsonBody(res);

      expect(res.status).toBe(200);
      expect(body).toMatchObject({
        id: 'user-1',
        email: 'owner@testgym.ae',
        fullName: 'Test Owner',
        tenantId: 'tenant-1',
        role: 'OWNER',
      });
    });
  });

  /* ─────────────────────────────────────────────────────────────── */
  /* POST /api/auth/onboard                                          */
  /* ─────────────────────────────────────────────────────────────── */
  describe('POST /api/auth/onboard', () => {
    beforeEach(() => {
      // Default: authenticated Clerk user
      mockClerkAuth.mockResolvedValue({ userId: 'clerk-user-1' });
      mockClerkCurrentUser.mockResolvedValue({
        firstName: 'Test',
        lastName: 'Owner',
        emailAddresses: [{ emailAddress: 'owner@testgym.ae' }],
        publicMetadata: {},
      });
      mockClerkClient.mockResolvedValue({
        users: { updateUser: mockClerkUpdateUser },
      });
      mockClerkUpdateUser.mockResolvedValue(undefined);

      mockPrisma.tenant.create.mockResolvedValue({
        id: 'tenant-new',
        name: 'FitLife Dubai',
        slug: 'fitlife-dubai-l2e3a4b5',
        country: 'AE',
        city: 'Dubai',
      });
      mockPrisma.user.create.mockResolvedValue({
        id: 'user-new',
        tenantId: 'tenant-new',
        clerkId: 'clerk-user-1',
        email: 'owner@testgym.ae',
        fullName: 'Test Owner',
        role: 'OWNER',
      });
      mockPrisma.subscription.create.mockResolvedValue({
        id: 'sub-new',
        tenantId: 'tenant-new',
        plan: 'STARTER',
        status: 'TRIALING',
      });
    });

    it('creates tenant, user, subscription, and sets Clerk metadata', async () => {
      const req = createReq({
        method: 'POST',
        body: { tenantName: 'FitLife Dubai' },
      });
      const res = await onboardHandlers.POST(req as any);
      const body = await jsonBody(res);

      expect(res.status).toBe(200);
      expect(body.tenant.name).toBe('FitLife Dubai');
      expect(body.user.email).toBe('owner@testgym.ae');
      expect(body.user.role).toBe('OWNER');
      expect(body.warning).toBeUndefined();

      expect(mockPrisma.tenant.create).toHaveBeenCalledTimes(1);
      expect(mockPrisma.user.create).toHaveBeenCalledTimes(1);
      expect(mockPrisma.subscription.create).toHaveBeenCalledTimes(1);
      expect(mockClerkUpdateUser).toHaveBeenCalledWith('clerk-user-1', {
        publicMetadata: {
          tenantId: 'tenant-new',
          internalUserId: 'user-new',
          role: 'OWNER',
        },
      });
    });

    it('generates a URL-safe slug from tenant name (lowercase, no special chars)', async () => {
      const req = createReq({
        method: 'POST',
        body: { tenantName: 'FitLife Dubai & Co.!' },
      });
      await onboardHandlers.POST(req as any);

      // Verify the slug in the Prisma create call (mock response is hardcoded)
      const createCall = mockPrisma.tenant.create.mock.calls[0][0];
      const slug: string = createCall.data.slug;
      expect(slug).toMatch(/^fitlife-dubai-co-[a-z0-9]+$/);
    });

    it('returns 401 when not authenticated', async () => {
      mockClerkAuth.mockResolvedValue({ userId: null });

      const req = createReq({
        method: 'POST',
        body: { tenantName: 'Test Gym' },
      });
      const res = await onboardHandlers.POST(req as any);
      const body = await jsonBody(res);

      expect(res.status).toBe(401);
      expect(body.message).toBe('Unauthenticated');
    });

    it('returns 400 with fieldErrors when tenantName is empty', async () => {
      const req = createReq({
        method: 'POST',
        body: { tenantName: '' },
      });
      const res = await onboardHandlers.POST(req as any);
      const body = await jsonBody(res);

      expect(res.status).toBe(400);
      expect(body.fieldErrors).toBeDefined();
      expect(body.fieldErrors.tenantName).toBeTruthy();
    });

    it('returns 400 when tenantName exceeds 100 characters', async () => {
      const req = createReq({
        method: 'POST',
        body: { tenantName: 'A'.repeat(101) },
      });
      const res = await onboardHandlers.POST(req as any);
      const body = await jsonBody(res);

      expect(res.status).toBe(400);
      expect(body.fieldErrors).toBeDefined();
    });

    it('returns 400 when tenantName is missing from body', async () => {
      const req = createReq({
        method: 'POST',
        body: {},
      });
      const res = await onboardHandlers.POST(req as any);
      const body = await jsonBody(res);

      expect(res.status).toBe(400);
      expect(body.fieldErrors).toBeDefined();
    });

    it('returns 400 when request body is not valid JSON', async () => {
      const req = new Request('http://localhost:3000/api/auth/onboard', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: 'not-json',
      });
      (req as any).nextUrl = new URL('http://localhost:3000/api/auth/onboard');

      const res = await onboardHandlers.POST(req as any);
      const body = await jsonBody(res);

      expect(res.status).toBe(400);
    });

    it('returns 404 when Clerk user not found', async () => {
      mockClerkCurrentUser.mockResolvedValue(null);

      const req = createReq({
        method: 'POST',
        body: { tenantName: 'Test Gym' },
      });
      const res = await onboardHandlers.POST(req as any);
      const body = await jsonBody(res);

      expect(res.status).toBe(404);
      expect(body.message).toBe('User not found');
    });

    it('returns 200 with warning when Clerk metadata update fails (DB records exist)', async () => {
      mockClerkUpdateUser.mockImplementation(() =>
        Promise.reject(new Error('Clerk API error')),
      );

      const req = createReq({
        method: 'POST',
        body: { tenantName: 'Test Gym' },
      });
      const res = await onboardHandlers.POST(req as any);
      const body = await jsonBody(res);

      expect(res.status).toBe(200);
      expect(body.warning).toMatch(/Session refresh required/);
      expect(body.tenant).toBeDefined();
      expect(body.user).toBeDefined();
    });

    it('creates a 14-day STARTER trial subscription', async () => {
      const req = createReq({
        method: 'POST',
        body: { tenantName: 'Test Gym' },
      });
      await onboardHandlers.POST(req as any);

      expect(mockPrisma.subscription.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            plan: 'STARTER',
            status: 'TRIALING',
            trialEndsAt: expect.any(Date),
          }),
        }),
      );
    });

    it('creates user with OWNER role during onboarding', async () => {
      const req = createReq({
        method: 'POST',
        body: { tenantName: 'Test Gym' },
      });
      await onboardHandlers.POST(req as any);

      expect(mockPrisma.user.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            role: 'OWNER',
            clerkId: 'clerk-user-1',
          }),
        }),
      );
    });

    it('sets tenant country to AE and city to Dubai by default', async () => {
      const req = createReq({
        method: 'POST',
        body: { tenantName: 'Test Gym' },
      });
      await onboardHandlers.POST(req as any);

      expect(mockPrisma.tenant.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            country: 'AE',
            city: 'Dubai',
          }),
        }),
      );
    });
  });
});

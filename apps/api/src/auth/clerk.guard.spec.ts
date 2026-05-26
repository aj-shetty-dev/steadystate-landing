import { ExecutionContext, UnauthorizedException } from '@nestjs/common';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ClerkAuthGuard } from './clerk.guard';

// ---------------------------------------------------------------------------
// Module-level mock for @clerk/backend verifyToken
// ---------------------------------------------------------------------------
const mockVerifyToken = vi.fn();
vi.mock('@clerk/backend', () => ({ verifyToken: (...args: unknown[]) => mockVerifyToken(...args) }));

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeContext(authHeader?: string): ExecutionContext {
  const req: Record<string, unknown> = { headers: { authorization: authHeader } };
  return {
    switchToHttp: () => ({
      getRequest: () => req,
    }),
  } as unknown as ExecutionContext;
}

function makePrisma(user: Record<string, unknown> | null = null) {
  return {
    user: {
      findUnique: vi.fn().mockResolvedValue(user),
    },
  };
}

const fakeEnv = { CLERK_SECRET_KEY: 'test_secret' } as never;

const fakeDbUser = {
  id: 'user-1',
  tenantId: 'tenant-1',
  role: 'ADMIN',
  clerkId: 'clerk-abc',
};

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('ClerkAuthGuard', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('throws UnauthorizedException when Authorization header is missing', async () => {
    const guard = new ClerkAuthGuard(fakeEnv, makePrisma() as never);
    await expect(guard.canActivate(makeContext(undefined))).rejects.toThrow(UnauthorizedException);
  });

  it('throws UnauthorizedException when header does not start with Bearer', async () => {
    const guard = new ClerkAuthGuard(fakeEnv, makePrisma() as never);
    await expect(guard.canActivate(makeContext('Basic xyz'))).rejects.toThrow(UnauthorizedException);
  });

  it('throws UnauthorizedException when verifyToken fails', async () => {
    mockVerifyToken.mockRejectedValueOnce(new Error('expired'));
    const guard = new ClerkAuthGuard(fakeEnv, makePrisma() as never);
    await expect(guard.canActivate(makeContext('Bearer bad.token'))).rejects.toThrow(UnauthorizedException);
  });

  it('throws UnauthorizedException when user is not in DB', async () => {
    mockVerifyToken.mockResolvedValueOnce({ sub: 'clerk-abc' });
    const guard = new ClerkAuthGuard(fakeEnv, makePrisma(null) as never);
    await expect(guard.canActivate(makeContext('Bearer valid.token'))).rejects.toThrow(UnauthorizedException);
  });

  it('resolves user and attaches it to the request on cache miss', async () => {
    mockVerifyToken.mockResolvedValueOnce({ sub: 'clerk-abc' });
    const prisma = makePrisma(fakeDbUser);
    const guard = new ClerkAuthGuard(fakeEnv, prisma as never);
    const ctx = makeContext('Bearer valid.token');

    const result = await guard.canActivate(ctx);

    expect(result).toBe(true);
    expect(prisma.user.findUnique).toHaveBeenCalledOnce();
    const req = ctx.switchToHttp().getRequest() as { user: { id: string; tenantId: string; role: string } };
    expect(req.user).toEqual({ id: 'user-1', tenantId: 'tenant-1', role: 'ADMIN' });
  });

  it('serves subsequent request from cache without hitting DB', async () => {
    mockVerifyToken.mockResolvedValue({ sub: 'clerk-abc' });
    const prisma = makePrisma(fakeDbUser);
    const guard = new ClerkAuthGuard(fakeEnv, prisma as never);

    // First request — populates cache
    await guard.canActivate(makeContext('Bearer token'));
    // Second request — should hit cache, not DB
    const ctx2 = makeContext('Bearer token');
    await guard.canActivate(ctx2);

    expect(prisma.user.findUnique).toHaveBeenCalledOnce(); // NOT twice
    const req = ctx2.switchToHttp().getRequest() as { user: { id: string } };
    expect(req.user.id).toBe('user-1');
  });

  it('re-queries DB when cache entry has expired', async () => {
    mockVerifyToken.mockResolvedValue({ sub: 'clerk-expired' });
    const prisma = makePrisma({ ...fakeDbUser, clerkId: 'clerk-expired' });
    const guard = new ClerkAuthGuard(fakeEnv, prisma as never);

    // Manually seed an already-expired cache entry
    (guard as unknown as { userCache: Map<string, { user: unknown; expiresAt: number }> })
      .userCache.set('clerk-expired', { user: { id: 'old', tenantId: 't0', role: 'STAFF' }, expiresAt: Date.now() - 1 });

    await guard.canActivate(makeContext('Bearer token'));

    // DB should have been queried to refresh the stale entry
    expect(prisma.user.findUnique).toHaveBeenCalledOnce();
    const cached = (guard as unknown as { userCache: Map<string, { user: unknown; expiresAt: number }> })
      .userCache.get('clerk-expired');
    expect((cached?.user as { id: string })?.id).toBe('user-1');
  });

  it('different clerkIds are cached independently', async () => {
    const userA = { ...fakeDbUser, id: 'user-a', clerkId: 'clerk-a' };
    const userB = { ...fakeDbUser, id: 'user-b', clerkId: 'clerk-b' };
    const prisma = {
      user: {
        findUnique: vi
          .fn()
          .mockResolvedValueOnce(userA)
          .mockResolvedValueOnce(userB),
      },
    };
    mockVerifyToken
      .mockResolvedValueOnce({ sub: 'clerk-a' })
      .mockResolvedValueOnce({ sub: 'clerk-b' })
      .mockResolvedValueOnce({ sub: 'clerk-a' });

    const guard = new ClerkAuthGuard(fakeEnv, prisma as never);

    await guard.canActivate(makeContext('Bearer tokenA'));
    await guard.canActivate(makeContext('Bearer tokenB'));
    const ctx3 = makeContext('Bearer tokenA');
    await guard.canActivate(ctx3); // should hit cache for A

    expect(prisma.user.findUnique).toHaveBeenCalledTimes(2); // once per unique user
    const req3 = ctx3.switchToHttp().getRequest() as { user: { id: string } };
    expect(req3.user.id).toBe('user-a');
  });
});

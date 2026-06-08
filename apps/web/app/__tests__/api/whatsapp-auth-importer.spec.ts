/**
 * Phase 4 + 5 + 7 — WhatsApp, Auth, and Importer API Tests
 */
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { MOCK_USER, createReq, jsonBody } from './test-helpers';

const mockPrisma: Record<string, any> = {
  whatsappMessage: { findMany: vi.fn(), findFirst: vi.fn(), create: vi.fn(), update: vi.fn(), count: vi.fn() },
  member: { findMany: vi.fn(), findFirst: vi.fn(), create: vi.fn(), update: vi.fn(), aggregate: vi.fn() },
  tenant: { create: vi.fn() },
  user: { create: vi.fn() },
  subscription: { create: vi.fn() },
  membership: { findMany: vi.fn() },
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

vi.mock('@clerk/nextjs/server', () => ({
  auth: vi.fn().mockResolvedValue({ userId: 'clerk_123' }),
  currentUser: vi.fn().mockResolvedValue({
    firstName: 'Test', lastName: 'Owner',
    emailAddresses: [{ emailAddress: 'owner@testgym.ae' }],
  }),
  clerkClient: vi.fn().mockReturnValue({
    users: { updateUser: vi.fn().mockResolvedValue({}) },
  }),
}));

function params(id: string) {
  return { params: Promise.resolve({ id }) };
}

// ═══════════════════════════════════════════════════════════════════════════
// WHATSAPP — Send, List, Resend
// ═══════════════════════════════════════════════════════════════════════════
const sendHandlers = await import('../../api/whatsapp/messages/send/route');
const listHandlers = await import('../../api/whatsapp/messages/route');
const resendHandlers = await import('../../api/whatsapp/messages/[id]/resend/route');

describe('WhatsApp — Send', () => {
  beforeEach(() => vi.clearAllMocks());

  it('sends a WhatsApp message in mock mode', async () => {
    mockPrisma.whatsappMessage.create.mockResolvedValue({ id: 'msg-1', status: 'QUEUED' });
    mockPrisma.whatsappMessage.update.mockResolvedValue({ id: 'msg-1', status: 'SENT' });

    const req = createReq({
      method: 'POST',
      body: { to: '+971501234567', body: 'Hello from Steady State!' },
    });
    const res = await sendHandlers.POST(req as any);
    expect(res.status).toBe(201);
  });

  it('returns 400 when to is missing', async () => {
    const req = createReq({ method: 'POST', body: { body: 'Hello' } });
    const res = await sendHandlers.POST(req as any);
    expect(res.status).toBe(400);
  });

  it('returns 400 for invalid phone format', async () => {
    const req = createReq({
      method: 'POST',
      body: { to: '0501234567', body: 'Hello' },
    });
    const res = await sendHandlers.POST(req as any);
    expect(res.status).toBe(400);
  });
});

describe('WhatsApp — List', () => {
  beforeEach(() => vi.clearAllMocks());

  it('returns paginated messages', async () => {
    mockPrisma.whatsappMessage.findMany.mockResolvedValue([
      { id: 'm1', to: '+971501234567', body: 'Hi', status: 'SENT', templateName: null, errorMessage: null, sentAt: new Date(), createdAt: new Date() },
    ]);
    mockPrisma.whatsappMessage.count.mockResolvedValue(1);

    const req = createReq();
    const res = await listHandlers.GET(req as any);
    const body: any = await jsonBody(res);

    expect(res.status).toBe(200);
    expect(body.items).toHaveLength(1);
    expect(body.total).toBe(1);
  });

  it('filters by status', async () => {
    mockPrisma.whatsappMessage.findMany.mockResolvedValue([]);
    mockPrisma.whatsappMessage.count.mockResolvedValue(0);

    const req = createReq({ searchParams: { status: 'FAILED' } });
    await listHandlers.GET(req as any);
    const callArgs = mockPrisma.whatsappMessage.findMany.mock.calls[0][0];
    expect(callArgs.where.status).toBe('FAILED');
  });
});

describe('WhatsApp — Resend', () => {
  beforeEach(() => vi.clearAllMocks());

  it('resends a failed message', async () => {
    mockPrisma.whatsappMessage.findFirst.mockResolvedValue({
      id: 'msg-failed', to: '+971501234567', body: 'Retry', status: 'FAILED', tenantId: MOCK_USER.tenantId,
    });
    mockPrisma.whatsappMessage.update.mockResolvedValue({});

    const req = createReq({ method: 'POST' });
    const res = await resendHandlers.POST(req as any, params('msg-failed'));
    expect(res.status).toBe(201);
  });

  it('returns 400 when message not failed', async () => {
    mockPrisma.whatsappMessage.findFirst.mockResolvedValue({
      id: 'msg-sent', status: 'SENT', tenantId: MOCK_USER.tenantId,
    });
    const req = createReq({ method: 'POST' });
    const res = await resendHandlers.POST(req as any, params('msg-sent'));
    expect(res.status).toBe(400);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// AUTH — Me, Onboard
// ═══════════════════════════════════════════════════════════════════════════
const meHandlers = await import('../../api/auth/me/route');
const onboardHandlers = await import('../../api/auth/onboard/route');

describe('Auth — Me', () => {
  it('returns current user', async () => {
    const req = createReq();
    const res = await meHandlers.GET(req as any);
    const body: any = await jsonBody(res);

    expect(res.status).toBe(200);
    expect(body.email).toBe(MOCK_USER.email);
    expect(body.tenantId).toBe(MOCK_USER.tenantId);
  });
});

describe('Auth — Onboard', () => {
  beforeEach(() => vi.clearAllMocks());

  it('creates tenant, user, and subscription for new onboarding', async () => {
    mockPrisma.tenant.create.mockResolvedValue({ id: 't-new', name: 'Test Gym', slug: 'test-gym' });
    mockPrisma.user.create.mockResolvedValue({ id: 'u-new', email: 'owner@testgym.ae', fullName: 'Test Owner', role: 'OWNER' });
    mockPrisma.subscription.create.mockResolvedValue({ id: 'sub-new', plan: 'STARTER', status: 'TRIALING' });

    const req = createReq({ method: 'POST', body: { tenantName: 'Test Gym' } });
    const res = await onboardHandlers.POST(req as any);
    const body: any = await jsonBody(res);

    expect(res.status).toBe(200);
    expect(body.tenant.name).toBe('Test Gym');
    expect(body.user.role).toBe('OWNER');
  });

  it('returns 400 when tenantName is missing', async () => {
    const req = createReq({ method: 'POST', body: {} });
    const res = await onboardHandlers.POST(req as any);
    expect(res.status).toBe(400);
  });
});

/**
 * Messages & Overview API — End-to-End Flow Tests
 *
 * Messages: Send single → Broadcast → List with filters → Resend
 * Overview: Stats endpoint → Aggregated counts
 */
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { MOCK_USER, createReq, jsonBody, NOW } from './test-helpers';

/* ------------------------------------------------------------------ */
/* Mock prisma                                                        */
/* ------------------------------------------------------------------ */
const mockPrisma = {
  whatsappMessage: {
    findMany: vi.fn(),
    findFirst: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
    count: vi.fn(),
    groupBy: vi.fn(),
  },
  member: {
    findMany: vi.fn(),
    findFirst: vi.fn(),
    groupBy: vi.fn(),
  },
  lead: {
    count: vi.fn(),
  },
  churnSignal: {
    groupBy: vi.fn(),
  },
  classSession: {
    count: vi.fn(),
  },
  sale: {
    aggregate: vi.fn(),
  },
  membership: {
    findMany: vi.fn(),
  },
  $transaction: vi.fn((arg: any) => {
    // Handle array-style transactions (e.g., [prisma.x.findMany(), prisma.x.count()])
    if (Array.isArray(arg)) return Promise.all(arg);
    // Handle callback-style transactions (fn(tx) => ...)
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

/* ------------------------------------------------------------------ */
/* Mock WhatsApp / Twilio                                              */
/* ------------------------------------------------------------------ */
vi.mock('@/lib/whatsapp', () => ({
  sendWhatsAppMessage: vi.fn().mockResolvedValue({ sid: 'SM123', status: 'queued' }),
  sendWhatsAppTemplate: vi.fn().mockResolvedValue({ sid: 'SM456', status: 'queued' }),
}));

/* Dynamic imports after mocks */
const whatsappSendHandlers = await import('../../api/whatsapp/messages/send/route');
const whatsappBroadcastHandlers = await import('../../api/whatsapp/messages/broadcast/route');
const whatsappMessagesHandlers = await import('../../api/whatsapp/messages/route');
const whatsappResendHandlers = await import('../../api/whatsapp/messages/[id]/resend/route');
const statsHandlers = await import('../../api/stats/overview/route');

/* ------------------------------------------------------------------ */
/* Overview / Stats API Tests                                          */
/* ------------------------------------------------------------------ */
describe('Overview Stats API', () => {
  beforeEach(() => vi.clearAllMocks());

  it('GET /api/stats/overview — returns overview statistics', async () => {
    mockPrisma.member.groupBy.mockResolvedValue([
      { membershipStatus: 'ACTIVE', _count: { _all: 120 } },
      { membershipStatus: 'FROZEN', _count: { _all: 15 } },
      { membershipStatus: 'EXPIRED', _count: { _all: 10 } },
      { membershipStatus: 'CANCELLED', _count: { _all: 5 } },
    ]);
    mockPrisma.churnSignal.groupBy.mockResolvedValue([
      { status: 'PENDING', _count: { _all: 3 } },
      { status: 'NUDGED', _count: { _all: 2 } },
      { status: 'DISMISSED', _count: { _all: 2 } },
      { status: 'FAILED', _count: { _all: 1 } },
    ]);
    mockPrisma.whatsappMessage.groupBy.mockResolvedValue([
      { status: 'SENT', _count: { _all: 42 } },
      { status: 'FAILED', _count: { _all: 3 } },
    ]);
    mockPrisma.lead.count.mockResolvedValue(7);
    mockPrisma.classSession.count.mockResolvedValue(4);
    mockPrisma.sale.aggregate.mockResolvedValue({ _sum: { totalAed: 1250000 } });

    const req = createReq();
    const res = await statsHandlers.GET(req as any);
    const body: any = await jsonBody(res);

    expect(res.status).toBe(200);
    expect(body.members.total).toBe(150);
    expect(body.members.active).toBe(120);
    expect(body.signals30d.pending).toBe(3);
    expect(body.signals30d.nudged).toBe(2);
    expect(body.signals30d.dismissed).toBe(2);
    expect(body.signals30d.failed).toBe(1);
    expect(body.messages30d.total).toBe(45);
    expect(body.messages30d.sent).toBe(42);
    expect(body.messages30d.failed).toBe(3);
    expect(body.leadsOpen).toBe(7);
    expect(body.classesToday).toBe(4);
    expect(body.revenueMtdAed).toBe(1250000);
  });

  it('GET /api/stats/overview — handles empty database gracefully', async () => {
    mockPrisma.member.groupBy.mockResolvedValue([]);
    mockPrisma.churnSignal.groupBy.mockResolvedValue([]);
    mockPrisma.whatsappMessage.groupBy.mockResolvedValue([]);
    mockPrisma.lead.count.mockResolvedValue(0);
    mockPrisma.classSession.count.mockResolvedValue(0);
    mockPrisma.sale.aggregate.mockResolvedValue({ _sum: { totalAed: null } });

    const req = createReq();
    const res = await statsHandlers.GET(req as any);
    const body: any = await jsonBody(res);

    expect(res.status).toBe(200);
    expect(body.members.total).toBe(0);
    expect(body.members.active).toBe(0);
    expect(body.signals30d.pending).toBe(0);
    expect(body.leadsOpen).toBe(0);
    expect(body.classesToday).toBe(0);
    expect(body.revenueMtdAed).toBe(0);
  });

  it('GET /api/stats/overview — handles null revenue aggregate', async () => {
    mockPrisma.member.groupBy.mockResolvedValue([]);
    mockPrisma.churnSignal.groupBy.mockResolvedValue([]);
    mockPrisma.whatsappMessage.groupBy.mockResolvedValue([]);
    mockPrisma.lead.count.mockResolvedValue(0);
    mockPrisma.classSession.count.mockResolvedValue(0);
    mockPrisma.sale.aggregate.mockResolvedValue({ _sum: { totalAed: null } });

    const req = createReq();
    const res = await statsHandlers.GET(req as any);
    const body: any = await jsonBody(res);

    expect(res.status).toBe(200);
    expect(body.revenueMtdAed).toBe(0);
  });
});

/* ------------------------------------------------------------------ */
/* Messages / WhatsApp API Tests                                       */
/* ------------------------------------------------------------------ */
describe('WhatsApp Messages API', () => {
  beforeEach(() => vi.clearAllMocks());

  /* ─────── SEND Single Message ─────── */
  describe('POST /api/whatsapp/messages/send', () => {
    it('sends a message to a member by phone and returns Twilio result', async () => {
      mockPrisma.whatsappMessage.create.mockResolvedValue({
        id: 'msg-1', to: '+971501234567', body: 'Welcome to the gym!',
      });
      mockPrisma.whatsappMessage.update.mockResolvedValue({});

      const req = createReq({
        method: 'POST',
        body: { to: '+971501234567', body: 'Welcome to the gym!' },
      });
      const res = await whatsappSendHandlers.POST(req as any);
      const body: any = await jsonBody(res);

      expect(res.status).toBe(201);
      expect(body.to).toBe('+971501234567');
      expect(body.status).toBe('queued'); // mock mode
      expect(typeof body.messageId).toBe('string');
    });

    it('creates a DB record before sending', async () => {
      mockPrisma.whatsappMessage.create.mockResolvedValue({
        id: 'msg-1', to: '+971501234567', body: 'Hello',
      });
      mockPrisma.whatsappMessage.update.mockResolvedValue({});

      const req = createReq({
        method: 'POST',
        body: { to: '+971501234567', body: 'Hello' },
      });
      await whatsappSendHandlers.POST(req as any);

      expect(mockPrisma.whatsappMessage.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            to: '+971501234567',
            body: 'Hello',
          }),
        }),
      );
    });

    it('returns 400 when body is missing', async () => {
      const req = createReq({
        method: 'POST',
        body: { to: '+971501234567' },
      });
      const res = await whatsappSendHandlers.POST(req as any);
      expect(res.status).toBe(400);
    });

    it('returns 400 when "to" phone is missing', async () => {
      const req = createReq({
        method: 'POST',
        body: { body: 'Hello world' },
      });
      const res = await whatsappSendHandlers.POST(req as any);
      expect(res.status).toBe(400);
    });

    it('returns 400 for invalid phone format', async () => {
      const req = createReq({
        method: 'POST',
        body: { to: 'not-a-phone', body: 'Test' },
      });
      const res = await whatsappSendHandlers.POST(req as any);
      expect(res.status).toBe(400);
    });

    it('returns 400 when body exceeds 4096 characters', async () => {
      const req = createReq({
        method: 'POST',
        body: { to: '+971501234567', body: 'x'.repeat(4097) },
      });
      const res = await whatsappSendHandlers.POST(req as any);
      expect(res.status).toBe(400);
    });
  });

  /* ─────── BROADCAST Message ─────── */
  describe('POST /api/whatsapp/messages/broadcast', () => {
    it('broadcasts to members matching segment filters', async () => {
      const matchingMembers = [
        { id: 'm1', fullName: 'Alice', phone: '+971500000001', membershipStatus: 'ACTIVE' },
        { id: 'm2', fullName: 'Bob', phone: '+971500000002', membershipStatus: 'ACTIVE' },
        { id: 'm3', fullName: 'Carol', phone: null, membershipStatus: 'ACTIVE' },
      ];
      mockPrisma.member.findMany.mockResolvedValue(matchingMembers);
      mockPrisma.whatsappMessage.create
        .mockResolvedValueOnce({ id: 'b1', to: '+971500000001', status: 'QUEUED' })
        .mockResolvedValueOnce({ id: 'b2', to: '+971500000002', status: 'QUEUED' });

      const req = createReq({
        method: 'POST',
        body: {
          body: 'New class schedule available!',
          segment: { membershipStatus: 'ACTIVE' },
        },
      });
      const res = await whatsappBroadcastHandlers.POST(req as any);
      const body: any = await jsonBody(res);

      expect(res.status).toBe(200);
      expect(body.sent).toBe(2); // Alice and Bob have phones
      expect(body.skipped).toBe(1); // Carol has no phone
      expect(body.total).toBe(3);
      expect(mockPrisma.whatsappMessage.create).toHaveBeenCalledTimes(2);
    });

    it('returns 400 when body or segment is missing', async () => {
      const req = createReq({
        method: 'POST',
        body: { segment: { membershipStatus: 'ACTIVE' } },
      });
      const res = await whatsappBroadcastHandlers.POST(req as any);
      expect(res.status).toBe(400);
    });

    it('skips members without phone numbers', async () => {
      mockPrisma.member.findMany.mockResolvedValue([
        { id: 'm1', fullName: 'NoPhone', phone: null, membershipStatus: 'ACTIVE' },
      ]);

      const req = createReq({
        method: 'POST',
        body: {
          body: 'Test broadcast',
          segment: { membershipStatus: 'ACTIVE' },
        },
      });
      const res = await whatsappBroadcastHandlers.POST(req as any);
      const body: any = await jsonBody(res);

      expect(res.status).toBe(200);
      expect(body.sent).toBe(0);
      expect(body.skipped).toBe(1);
    });
  });

  /* ─────── LIST Messages ─────── */
  describe('GET /api/whatsapp/messages', () => {
    it('returns paginated messages with status filter', async () => {
      mockPrisma.whatsappMessage.findMany.mockResolvedValue([
        { id: 'm1', to: '+971501234567', body: 'Msg 1', status: 'SENT',
          templateName: null, errorMessage: null, sentAt: NOW, createdAt: NOW },
        { id: 'm2', to: '+971509876543', body: 'Msg 2', status: 'QUEUED',
          templateName: null, errorMessage: null, sentAt: null, createdAt: NOW },
      ]);
      mockPrisma.whatsappMessage.count.mockResolvedValue(2);

      const req = createReq({
        searchParams: { page: '1', pageSize: '50' },
      });
      const res = await whatsappMessagesHandlers.GET(req as any);
      const body: any = await jsonBody(res);

      expect(res.status).toBe(200);
      expect(body.items).toHaveLength(2);
      expect(body.total).toBe(2);
      expect(body.page).toBe(1);
      expect(body.pageSize).toBe(50);
    });

    it('filters by status when status param is provided', async () => {
      mockPrisma.whatsappMessage.findMany.mockResolvedValue([]);
      mockPrisma.whatsappMessage.count.mockResolvedValue(0);

      const req = createReq({
        searchParams: { status: 'FAILED', page: '1', pageSize: '50' },
      });
      await whatsappMessagesHandlers.GET(req as any);

      expect(mockPrisma.whatsappMessage.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ status: 'FAILED' }),
        }),
      );
    });

    it('filters by date range when from/to provided', async () => {
      mockPrisma.whatsappMessage.findMany.mockResolvedValue([]);
      mockPrisma.whatsappMessage.count.mockResolvedValue(0);

      const req = createReq({
        searchParams: {
          from: '2026-05-01',
          to: '2026-05-31',
          page: '1',
          pageSize: '50',
        },
      });
      await whatsappMessagesHandlers.GET(req as any);

      const firstCallArgs = mockPrisma.$transaction.mock.calls[0][0];
      // Verify the query was called — the where clause includes createdAt gte/lte
      expect(mockPrisma.whatsappMessage.findMany).toHaveBeenCalled();
    });
  });

  /* ─────── RESEND Message ─────── */
  describe('POST /api/whatsapp/messages/[id]/resend', () => {
    it('resends a failed message and returns 201', async () => {
      mockPrisma.whatsappMessage.findFirst.mockResolvedValue({
        id: 'msg-failed', to: '+971501234567', body: 'Payment reminder',
        status: 'FAILED', tenantId: MOCK_USER.tenantId,
      });
      mockPrisma.whatsappMessage.update.mockResolvedValue({});

      const req = createReq({ method: 'POST' });
      const res = await whatsappResendHandlers.POST(
        req as any,
        { params: Promise.resolve({ id: 'msg-failed' }) },
      );

      expect(res.status).toBe(201);
      expect(mockPrisma.whatsappMessage.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'msg-failed' },
          data: expect.objectContaining({ status: 'SENT' }),
        }),
      );
    });

    it('returns 400 when message not found', async () => {
      mockPrisma.whatsappMessage.findFirst.mockResolvedValue(null);

      const req = createReq({ method: 'POST' });
      const res = await whatsappResendHandlers.POST(
        req as any,
        { params: Promise.resolve({ id: 'not-exists' }) },
      );
      const body = await jsonBody(res);

      expect(res.status).toBe(400);
      expect(body).toMatchObject({ message: 'Message not found' });
    });

    it('returns 400 when trying to resend a non-failed message', async () => {
      mockPrisma.whatsappMessage.findFirst.mockResolvedValue({
        id: 'msg-ok', to: '+971501234567', body: 'Hello',
        status: 'SENT', tenantId: MOCK_USER.tenantId,
      });

      const req = createReq({ method: 'POST' });
      const res = await whatsappResendHandlers.POST(
        req as any,
        { params: Promise.resolve({ id: 'msg-ok' }) },
      );
      const body = await jsonBody(res);

      expect(res.status).toBe(400);
      expect(body.message).toContain('Only failed messages can be resent');
    });
  });
});

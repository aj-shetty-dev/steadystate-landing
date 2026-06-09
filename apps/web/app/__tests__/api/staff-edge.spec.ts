/**
 * Staff API — Edge Case & Validation Tests
 *
 * Covers: fieldErrors, PIN uniqueness, email validation, roles, reactivation.
 */
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { MOCK_USER, createReq, jsonBody } from './test-helpers';

const mockPrisma: Record<string, any> = {
  staff: { findMany: vi.fn(), findFirst: vi.fn(), create: vi.fn(), update: vi.fn() },
};

vi.mock('@/lib/prisma', () => ({ prisma: mockPrisma }));
vi.mock('@/lib/auth-server', () => ({
  requireServerUser: vi.fn().mockResolvedValue(MOCK_USER),
  requireTenantId: vi.fn().mockResolvedValue(MOCK_USER.tenantId),
}));

const mockBcryptHash = vi.fn().mockResolvedValue('$2a$10$hashedmock');
const mockBcryptCompare = vi.fn().mockResolvedValue(false);

vi.mock('bcryptjs', () => ({
  default: { hash: mockBcryptHash, compare: mockBcryptCompare },
  __esModule: true,
}));

const staffHandlers = await import('../../api/staff/route');
const staffIdHandlers = await import('../../api/staff/[id]/route');
const reactivateHandlers = await import('../../api/staff/[id]/reactivate/route');

function params(id: string) { return { params: Promise.resolve({ id }) }; }

/* ─────────────────────────────────────────────────────────────────── */
/* POST /api/staff — Validation                                        */
/* ─────────────────────────────────────────────────────────────────── */
describe('POST /api/staff — Validation', () => {
  beforeEach(() => vi.clearAllMocks());

  it('returns 400 with fieldErrors when fullName missing', async () => {
    const req = createReq({ method: 'POST', body: { role: 'TRAINER' } });
    const res = await staffHandlers.POST(req as any);
    const body = await jsonBody(res);
    expect(res.status).toBe(400);
    expect(body.fieldErrors).toBeDefined();
  });

  it('returns 400 when role is invalid', async () => {
    const req = createReq({ method: 'POST', body: { fullName: 'Test', role: 'CEO' } });
    const res = await staffHandlers.POST(req as any);
    expect(res.status).toBe(400);
  });

  it.each(['TRAINER', 'RECEPTION', 'MANAGER', 'CLEANER', 'OTHER'])(
    'accepts valid role: %s',
    async (role) => {
      mockPrisma.staff.findMany.mockResolvedValue([]);
      mockPrisma.staff.create.mockResolvedValue({
        id: 's-new', fullName: 'Test', role, active: true, pinHash: null,
      });
      const req = createReq({ method: 'POST', body: { fullName: 'Test', role } });
      const res = await staffHandlers.POST(req as any);
      expect(res.status).toBe(201);
    },
  );

  it('returns 400 when email is invalid', async () => {
    const req = createReq({
      method: 'POST',
      body: { fullName: 'Test', role: 'TRAINER', email: 'not-an-email' },
    });
    const res = await staffHandlers.POST(req as any);
    expect(res.status).toBe(400);
  });

  it('returns 400 when PIN format is invalid (too short)', async () => {
    const req = createReq({
      method: 'POST',
      body: { fullName: 'Test', role: 'TRAINER', pin: '123' },
    });
    const res = await staffHandlers.POST(req as any);
    expect(res.status).toBe(400);
  });

  it('returns 400 when PIN format is invalid (too long)', async () => {
    const req = createReq({
      method: 'POST',
      body: { fullName: 'Test', role: 'TRAINER', pin: '123456789' },
    });
    const res = await staffHandlers.POST(req as any);
    expect(res.status).toBe(400);
  });

  it('returns 400 when hourlyRateAed is negative', async () => {
    const req = createReq({
      method: 'POST',
      body: { fullName: 'Test', role: 'TRAINER', hourlyRateAed: -1 },
    });
    const res = await staffHandlers.POST(req as any);
    expect(res.status).toBe(400);
  });

  it('returns 400 when commissionPercent is out of range', async () => {
    const req = createReq({
      method: 'POST',
      body: { fullName: 'Test', role: 'TRAINER', commissionPercent: 101 },
    });
    const res = await staffHandlers.POST(req as any);
    expect(res.status).toBe(400);
  });

  it('accepts commissionPercent of 0', async () => {
    mockPrisma.staff.findMany.mockResolvedValue([]);
    mockPrisma.staff.create.mockResolvedValue({
      id: 's-new', fullName: 'Test', role: 'TRAINER', active: true, commissionPercent: 0,
    });
    const req = createReq({
      method: 'POST',
      body: { fullName: 'Test', role: 'TRAINER', commissionPercent: 0 },
    });
    const res = await staffHandlers.POST(req as any);
    expect(res.status).toBe(201);
  });

  it('returns 400 when color format is invalid', async () => {
    const req = createReq({
      method: 'POST',
      body: { fullName: 'Test', role: 'TRAINER', color: 'red' },
    });
    const res = await staffHandlers.POST(req as any);
    expect(res.status).toBe(400);
  });

  it('accepts valid hex color', async () => {
    mockPrisma.staff.findMany.mockResolvedValue([]);
    mockPrisma.staff.create.mockResolvedValue({
      id: 's-new', fullName: 'Test', role: 'TRAINER', active: true, color: '#ff6600',
    });
    const req = createReq({
      method: 'POST',
      body: { fullName: 'Test', role: 'TRAINER', color: '#FF6600' },
    });
    const res = await staffHandlers.POST(req as any);
    expect(res.status).toBe(201);
  });

  it('accepts hourlyRateAed of 0 (volunteer/unpaid)', async () => {
    mockPrisma.staff.findMany.mockResolvedValue([]);
    mockPrisma.staff.create.mockResolvedValue({
      id: 's-vol', fullName: 'Volunteer', role: 'OTHER', active: true, hourlyRateAed: 0,
    });
    const req = createReq({
      method: 'POST',
      body: { fullName: 'Volunteer', role: 'OTHER', hourlyRateAed: 0 },
    });
    const res = await staffHandlers.POST(req as any);
    expect(res.status).toBe(201);
  });

  it('returns 400 when PIN is already in use', async () => {
    mockPrisma.staff.findMany.mockResolvedValue([
      { id: 's1', pinHash: '$2a$10$existing' },
    ]);
    mockBcryptCompare.mockResolvedValueOnce(true); // PIN matches existing

    const req = createReq({
      method: 'POST',
      body: { fullName: 'Test', role: 'TRAINER', pin: '1234' },
    });
    const res = await staffHandlers.POST(req as any);
    const body = await jsonBody(res);
    expect(res.status).toBe(400);
    expect(body.message).toContain('PIN already in use');
  });
});

/* ─────────────────────────────────────────────────────────────────── */
/* PATCH /api/staff/[id] — Validation                                  */
/* ─────────────────────────────────────────────────────────────────── */
describe('PATCH /api/staff/[id] — Validation', () => {
  beforeEach(() => vi.clearAllMocks());

  it('returns 400 with fieldErrors when email is invalid', async () => {
    mockPrisma.staff.findFirst.mockResolvedValue({ id: 's1', fullName: 'Test' });
    const req = createReq({ method: 'PATCH', body: { email: 'bad-email' } });
    const res = await staffIdHandlers.PATCH(req as any, params('s1'));
    expect(res.status).toBe(400);
  });

  it('returns 404 when staff not found', async () => {
    mockPrisma.staff.findFirst.mockResolvedValue(null);
    const req = createReq({ method: 'PATCH', body: { fullName: 'X' } });
    const res = await staffIdHandlers.PATCH(req as any, params('ghost'));
    expect(res.status).toBe(404);
  });

  it('accepts partial update with only fullName', async () => {
    mockPrisma.staff.findFirst.mockResolvedValue({ id: 's1' });
    mockPrisma.staff.findMany.mockResolvedValue([]);
    mockPrisma.staff.update.mockResolvedValue({ id: 's1', fullName: 'Updated' });
    const req = createReq({ method: 'PATCH', body: { fullName: 'Updated' } });
    const res = await staffIdHandlers.PATCH(req as any, params('s1'));
    expect(res.status).toBe(200);
  });

  it('returns 400 when trying to set duplicate PIN', async () => {
    mockPrisma.staff.findFirst.mockResolvedValue({ id: 's1' });
    mockPrisma.staff.findMany.mockResolvedValue([
      { id: 's2', pinHash: '$2a$10$other' },
    ]);
    mockBcryptCompare.mockResolvedValueOnce(true); // PIN matches s2

    const req = createReq({ method: 'PATCH', body: { pin: '1234' } });
    const res = await staffIdHandlers.PATCH(req as any, params('s1'));
    expect(res.status).toBe(400);
  });
});

/* ─────────────────────────────────────────────────────────────────── */
/* Staff Reactivation                                                  */
/* ─────────────────────────────────────────────────────────────────── */
describe('POST /api/staff/[id]/reactivate', () => {
  beforeEach(() => vi.clearAllMocks());

  it('reactivates a terminated staff member', async () => {
    mockPrisma.staff.findFirst.mockResolvedValue({
      id: 's1', active: false, terminatedAt: new Date('2025-01-01'),
    });
    mockPrisma.staff.update.mockResolvedValue({
      id: 's1', active: true, terminatedAt: null,
    });
    const req = createReq({ method: 'POST' });
    const res = await reactivateHandlers.POST(req as any, params('s1'));
    expect(res.status).toBe(200);
    expect(mockPrisma.staff.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: { active: true, terminatedAt: null },
      }),
    );
  });

  it('returns 404 when staff not found', async () => {
    mockPrisma.staff.findFirst.mockResolvedValue(null);
    const req = createReq({ method: 'POST' });
    const res = await reactivateHandlers.POST(req as any, params('ghost'));
    expect(res.status).toBe(404);
  });
});

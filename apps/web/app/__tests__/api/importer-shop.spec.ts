/**
 * Phase 7 + remaining — Importer and Shop API Tests
 */
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { MOCK_USER, createReq, jsonBody } from './test-helpers';

const mockPrisma: Record<string, any> = {
  member: { findFirst: vi.fn(), create: vi.fn(), update: vi.fn() },
  product: { findMany: vi.fn(), findFirst: vi.fn(), create: vi.fn(), update: vi.fn(), count: vi.fn() },
};

vi.mock('@/lib/prisma', () => ({ prisma: mockPrisma }));
vi.mock('@/lib/auth-server', () => ({
  requireServerUser: vi.fn().mockResolvedValue(MOCK_USER),
  requireTenantId: vi.fn().mockResolvedValue(MOCK_USER.tenantId),
}));

const previewHandlers = await import('../../api/importer/members/preview/route');
const applyHandlers = await import('../../api/importer/members/apply/route');
const productsHandlers = await import('../../api/shop/products/route');

// ═══════════════════════════════════════════════════════════════════════════
// IMPORTER — Preview
// ═══════════════════════════════════════════════════════════════════════════
describe('POST /api/importer/members/preview', () => {
  beforeEach(() => vi.clearAllMocks());

  it('parses CSV and returns preview with toCreate/toUpdate counts', async () => {
    // Mock: no existing members (all new)
    mockPrisma.member.findFirst.mockResolvedValue(null);

    const csv = 'fullName,phone,email\nAhmed,+971501234567,ahmed@test.com\nFatima,+971509876543,fatima@test.com';
    const req = createReq({ method: 'POST', body: { csv } });
    const res = await previewHandlers.POST(req as any);
    const body: any = await jsonBody(res);

    expect(res.status).toBe(200);
    expect(body.totalRows).toBe(2);
    expect(body.toCreate).toHaveLength(2);
    expect(body.toUpdate).toHaveLength(0);
  });

  it('detects members to update when phone matches but name differs', async () => {
    // First call: existing member with DIFFERENT name → toUpdate
    mockPrisma.member.findFirst
      .mockResolvedValueOnce({ id: 'mem-1', fullName: 'Ahmed Old' }) // old name
      .mockResolvedValueOnce(null); // second row: no existing → toCreate

    const csv = 'fullName,phone,email\nAhmed Updated,+971501234567,ahmed@test.com\nNew Member,+971500000000,new@test.com';
    const req = createReq({ method: 'POST', body: { csv } });
    const res = await previewHandlers.POST(req as any);
    const body: any = await jsonBody(res);

    expect(res.status).toBe(200);
    expect(body.toUpdate).toHaveLength(1);
    expect(body.toCreate).toHaveLength(1);
  });

  it('returns 400 when CSV is empty', async () => {
    const req = createReq({ method: 'POST', body: {} });
    const res = await previewHandlers.POST(req as any);
    expect(res.status).toBe(400);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// IMPORTER — Apply
// ═══════════════════════════════════════════════════════════════════════════
describe('POST /api/importer/members/apply', () => {
  beforeEach(() => vi.clearAllMocks());

  it('creates and updates members from CSV data', async () => {
    // First member: existing with different name → update
    mockPrisma.member.findFirst
      .mockResolvedValueOnce({ id: 'mem-old', fullName: 'Old Name' })
      // Second member: new → create
      .mockResolvedValueOnce(null);

    mockPrisma.member.update.mockResolvedValue({ id: 'mem-old' });
    mockPrisma.member.create.mockResolvedValue({ id: 'mem-new' });

    const csv = 'fullName,phone,email\nAhmed Updated,+971501234567,ahmed@test.com\nNew Member,+971500000000,new@test.com';
    const req = createReq({ method: 'POST', body: { csv } });
    const res = await applyHandlers.POST(req as any);
    const body: any = await jsonBody(res);

    expect(res.status).toBe(200);
    expect(body.created).toBe(1);
    expect(body.updated).toBe(1);
  });

  it('returns 400 when both toCreate and toUpdate are empty', async () => {
    const req = createReq({ method: 'POST', body: { toCreate: [], toUpdate: [] } });
    const res = await applyHandlers.POST(req as any);
    expect(res.status).toBe(400);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// SHOP — Products
// ═══════════════════════════════════════════════════════════════════════════
describe('GET /api/shop/products', () => {
  beforeEach(() => vi.clearAllMocks());

  it('returns active products for tenant', async () => {
    mockPrisma.product.findMany.mockResolvedValue([
      { id: 'prod-1', sku: 'PRO-001', nameEn: 'Protein Shake', priceAed: 2500, active: true },
      { id: 'prod-2', sku: 'TOW-001', nameEn: 'Gym Towel', priceAed: 1500, active: true },
    ]);

    const req = createReq();
    const res = await productsHandlers.GET(req as any);
    const body: any = await jsonBody(res);

    expect(res.status).toBe(200);
    expect(body).toHaveLength(2);
    expect(body[0].nameEn).toBe('Protein Shake');
  });
});

import { describe, expect, it, vi, beforeEach } from 'vitest';

const mockQueryRaw = vi.fn();
vi.mock('../../../../lib/prisma', () => ({
  prisma: {
    $queryRaw: (...args: unknown[]) => mockQueryRaw(...args),
  },
}));

const { GET } = await import('../route');

describe('GET /api/health', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns ok: true when database is reachable', async () => {
    mockQueryRaw.mockResolvedValueOnce([{ '?column?': 1 }]);

    const res = await GET();
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body).toEqual({ ok: true });
  });

  it('returns ok: false with 503 when database is unreachable', async () => {
    mockQueryRaw.mockRejectedValueOnce(new Error('connection refused'));

    const res = await GET();
    const body = await res.json();

    expect(res.status).toBe(503);
    expect(body).toEqual({ ok: false });
  });

  it('uses SELECT 1 as the health query', async () => {
    mockQueryRaw.mockResolvedValueOnce([{ '?column?': 1 }]);

    await GET();

    expect(mockQueryRaw).toHaveBeenCalledTimes(1);
    const sql = String(mockQueryRaw.mock.calls[0][0]);
    expect(sql).toContain('SELECT 1');
  });
});

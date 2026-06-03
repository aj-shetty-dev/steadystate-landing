import { vi } from 'vitest';

/**
 * Standard mock user for all API tests.
 * Matches the ServerUser interface from lib/auth-server.
 */
export const MOCK_USER = {
  id: 'user-1',
  email: 'owner@testgym.ae',
  fullName: 'Test Owner',
  tenantId: 'tenant-1',
  role: 'OWNER' as const,
};

/**
 * Sets up the requireServerUser mock to return MOCK_USER by default.
 * Call this in beforeEach() of every test suite.
 */
export function mockAuth() {
  vi.mock('@/lib/auth-server', () => ({
    requireServerUser: vi.fn().mockResolvedValue(MOCK_USER),
    requireTenantId: vi.fn().mockResolvedValue(MOCK_USER.tenantId),
    getServerUser: vi.fn().mockResolvedValue(MOCK_USER),
  }));
}

/**
 * Creates a mock NextRequest with optional body, method, and search params.
 * Adds `nextUrl` so Next.js route handlers can read searchParams.
 */
export function createReq(
  init: {
    method?: string;
    body?: unknown;
    searchParams?: Record<string, string>;
  } = {},
): any {
  const url = new URL('http://localhost:3000/api/test');
  if (init.searchParams) {
    Object.entries(init.searchParams).forEach(([k, v]) => url.searchParams.set(k, v));
  }
  const req = new Request(url, {
    method: init.method ?? 'GET',
    headers: { 'Content-Type': 'application/json' },
    body: init.body !== undefined ? JSON.stringify(init.body) : undefined,
  });
  // Next.js server handlers expect this property
  (req as any).nextUrl = url;
  return req;
}

/**
 * Helper to parse a Response body as JSON.
 */
export async function jsonBody(res: Response): Promise<unknown> {
  return res.json();
}

/**
 * Standard createdAt/updatedAt timestamps for mock responses.
 */
export const NOW = new Date('2026-06-03T09:00:00Z');

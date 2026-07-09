/**
 * Layer 2 E2E: Real HTTP Routing Tests
 *
 * Hits the actual Next.js dev server over HTTP.
 * Catches: 405 Method Not Allowed, real status codes, JSON parsing,
 * middleware auth behavior.
 */
import { test, expect } from '@playwright/test';

// All API routes and their expected behavior
const PROTECTED_GETS = [
  '/api/members',
  '/api/memberships',
  '/api/membership-plans',
  '/api/checkins',
  '/api/billing/invoices',
  '/api/billing/reconciliation',
  '/api/billing/salary-window',
  '/api/billing/schedule',
  '/api/classes/types',
  '/api/classes/sessions',
  '/api/classes/recurrences',
  '/api/staff',
  '/api/pos/sales',
  '/api/shop/products',
  '/api/stats/overview',
  '/api/whatsapp/messages',
  '/api/auth/me',
];

/* ─────────────────────────────────────────────────────────────── */
/* Public pages                                                    */
/* ─────────────────────────────────────────────────────────────── */
test.describe('Public pages', () => {
  test('sign-in page loads', async ({ page }) => {
    const res = await page.goto('/sign-in');
    expect(res?.status()).toBe(200);
  });

  test('pricing page loads', async ({ page }) => {
    const res = await page.goto('/pricing');
    expect(res?.status()).toBe(200);
  });

  test('onboarding page loads (client-side auth handled by Clerk)', async ({ page }) => {
    const res = await page.goto('/onboarding');
    // Onboarding is a client component — it renders and handles auth state via Clerk
    expect(res?.status()).toBe(200);
  });
});

/* ─────────────────────────────────────────────────────────────── */
/* API: Auth protection                                             */
/* ─────────────────────────────────────────────────────────────── */
test.describe('API auth middleware', () => {
  for (const endpoint of PROTECTED_GETS) {
    test(`${endpoint} returns 401 when unauthenticated`, async ({ request }) => {
      const res = await request.get(endpoint);
      expect(res.status()).toBe(401);
    });
  }
});

/* ─────────────────────────────────────────────────────────────── */
/* API: POST routes reject unauthenticated                          */
/* ─────────────────────────────────────────────────────────────── */
test.describe('API POST auth protection', () => {
  const PROTECTED_POSTS = [
    '/api/members',
    '/api/memberships',
    '/api/membership-plans',
    '/api/checkins',
    '/api/billing/invoices',
    '/api/classes/types',
    '/api/classes/sessions',
    '/api/staff',
    '/api/pos/sales',
  ];

  for (const endpoint of PROTECTED_POSTS) {
    test(`${endpoint} POST returns 401 when unauthenticated`, async ({ request }) => {
      const res = await request.post(endpoint, { data: {} });
      expect(res.status()).toBe(401);
    });
  }
});

/* ─────────────────────────────────────────────────────────────── */
/* API: Method routing — correct methods return expected status     */
/* ─────────────────────────────────────────────────────────────── */
test.describe('API method routing', () => {
  test('POST /api/billing/salary-window returns 401 (not 405)', async ({ request }) => {
    // Bug was: frontend sent PUT, route only had POST → 405
    // Fix: frontend now sends POST, route handles POST
    const res = await request.post('/api/billing/salary-window', { data: {} });
    expect(res.status()).toBe(401); // auth rejection, NOT 405
  });

  test('POST /api/members/[id]/deactivate returns 401 (not 405)', async ({ request }) => {
    // Bug was: frontend sent PATCH, route only had POST → 405
    // Fix: route now exports both POST and PATCH
    const res = await request.post('/api/members/fake-id/deactivate');
    expect(res.status()).toBe(401); // auth rejection, NOT 405
  });

  test('PATCH /api/members/[id]/deactivate returns 401 (not 405)', async ({ request }) => {
    const res = await request.patch('/api/members/fake-id/deactivate');
    expect(res.status()).toBe(401);
  });

  test('DELETE /api/membership-plans/[id] returns 401 (not 405)', async ({ request }) => {
    // Bug was: missing DELETE export → 405
    // Fix: added DELETE handler
    const res = await request.delete('/api/membership-plans/fake-id');
    expect(res.status()).toBe(401); // auth rejection, NOT 405
  });
});

/* ─────────────────────────────────────────────────────────────── */
/* Health check                                                     */
/* ─────────────────────────────────────────────────────────────── */
test.describe('Health check', () => {
  test('GET /api/health returns 200', async ({ request }) => {
    const res = await request.get('/api/health');
    expect(res.status()).toBe(200);
  });
});

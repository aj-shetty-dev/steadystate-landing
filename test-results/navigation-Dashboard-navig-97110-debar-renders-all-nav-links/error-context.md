# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: navigation.spec.ts >> Dashboard navigation >> sidebar renders all nav links
- Location: e2e/browser/navigation.spec.ts:18:7

# Error details

```
Error: expect(locator).toBeVisible() failed

Locator: getByText('Overview')
Expected: visible
Error: strict mode violation: getByText('Overview') resolved to 2 elements:
    1) <span class="truncate">Overview</span> aka getByRole('link', { name: 'Overview' })
    2) <span class="truncate">Overview</span> aka getByText('Overview').nth(1)

Call log:
  - Expect "toBeVisible" with timeout 5000ms
  - waiting for getByText('Overview')

```

# Page snapshot

```yaml
- generic [active] [ref=e1]:
  - generic [ref=e2]:
    - complementary [ref=e3]:
      - generic [ref=e5]:
        - img [ref=e7]
        - generic [ref=e11]: SteadyState
      - navigation [ref=e12]:
        - link "Overview" [ref=e13] [cursor=pointer]:
          - /url: /overview
          - generic [ref=e14]:
            - img [ref=e15]
            - generic [ref=e20]: Overview
        - link "Members" [ref=e21] [cursor=pointer]:
          - /url: /members
          - generic [ref=e22]:
            - img [ref=e23]
            - generic [ref=e28]: Members
        - link "Memberships" [ref=e29] [cursor=pointer]:
          - /url: /memberships
          - generic [ref=e30]:
            - img [ref=e31]
            - generic [ref=e34]: Memberships
        - link "Classes" [ref=e35] [cursor=pointer]:
          - /url: /classes
          - generic [ref=e36]:
            - img [ref=e37]
            - generic [ref=e39]: Classes
        - link "Check-ins" [ref=e40] [cursor=pointer]:
          - /url: /checkins
          - generic [ref=e41]:
            - img [ref=e42]
            - generic [ref=e47]: Check-ins
        - link "POS" [ref=e48] [cursor=pointer]:
          - /url: /pos
          - generic [ref=e49]:
            - img [ref=e50]
            - generic [ref=e53]: POS
        - link "Staff" [ref=e54] [cursor=pointer]:
          - /url: /staff
          - generic [ref=e55]:
            - img [ref=e56]
            - generic [ref=e68]: Staff
        - link "Billing" [ref=e69] [cursor=pointer]:
          - /url: /billing
          - generic [ref=e70]:
            - img [ref=e71]
            - generic [ref=e74]: Billing
        - link "Messages" [ref=e75] [cursor=pointer]:
          - /url: /messages
          - generic [ref=e76]:
            - img [ref=e77]
            - generic [ref=e79]: Messages
      - generic [ref=e80]:
        - generic [ref=e81]:
          - generic [ref=e82]: ET
          - generic [ref=e83]:
            - generic [ref=e84]: E2E Tester
            - generic [ref=e85]: e2e@test.com
        - generic [ref=e86]:
          - button "Switch to light mode" [ref=e87] [cursor=pointer]:
            - img [ref=e88]
          - button "Sign out" [ref=e94] [cursor=pointer]:
            - img [ref=e95]
            - text: Sign out
    - main [ref=e98]:
      - generic [ref=e101]:
        - img [ref=e102]
        - generic [ref=e104]: Internal Server Error
  - button "Open Next.js Dev Tools" [ref=e110] [cursor=pointer]:
    - img [ref=e111]
  - alert [ref=e114]
```

# Test source

```ts
  1  | /**
  2  |  * Browser Navigation E2E — Tests that all pages render under E2E_TEST_MODE.
  3  |  * Runs against the real dev server with Clerk auth bypassed.
  4  |  */
  5  | import { test, expect } from '@playwright/test';
  6  | 
  7  | test.describe('Dashboard navigation', () => {
  8  |   test('all dashboard pages load without auth errors', async ({ page }) => {
  9  |     const routes = ['/overview', '/members', '/memberships', '/billing', '/checkins', '/classes', '/staff', '/pos', '/messages'];
  10 |     for (const route of routes) {
  11 |       const res = await page.goto(route);
  12 |       expect(res?.status()).toBe(200);
  13 |       // Should NOT redirect to sign-in
  14 |       expect(res?.url()).not.toContain('/sign-in');
  15 |     }
  16 |   });
  17 | 
  18 |   test('sidebar renders all nav links', async ({ page }) => {
  19 |     await page.goto('/members');
> 20 |     await expect(page.getByText('Overview')).toBeVisible({ timeout: 5000 });
     |                                              ^ Error: expect(locator).toBeVisible() failed
  21 |     await expect(page.getByText('Members')).toBeVisible();
  22 |     await expect(page.getByText('Memberships')).toBeVisible();
  23 |     await expect(page.getByText('Classes')).toBeVisible();
  24 |     await expect(page.getByText('Check-ins')).toBeVisible();
  25 |     await expect(page.getByText('Billing')).toBeVisible();
  26 |     await expect(page.getByText('Staff')).toBeVisible();
  27 |   });
  28 | });
  29 | 
  30 | test.describe('Members tab UI', () => {
  31 |   test.beforeEach(async ({ page }) => {
  32 |     await page.goto('/members');
  33 |     await page.waitForLoadState('networkidle');
  34 |   });
  35 | 
  36 |   test('page header and action buttons render', async ({ page }) => {
  37 |     await expect(page.getByText('Members')).toBeVisible({ timeout: 5000 });
  38 |     await expect(page.getByText('Add Member')).toBeVisible();
  39 |     await expect(page.getByText('Import CSV')).toBeVisible();
  40 |   });
  41 | 
  42 |   test('Add Member modal opens with all sections', async ({ page }) => {
  43 |     await page.getByText('Add Member').click();
  44 |     await expect(page.getByRole('dialog', { name: 'Add member' })).toBeVisible({ timeout: 3000 });
  45 |     await expect(page.getByText('Identity')).toBeVisible();
  46 |     await expect(page.getByText('Membership')).toBeVisible();
  47 |     await expect(page.getByText('Personal')).toBeVisible();
  48 |     await expect(page.getByText('Emergency Contact')).toBeVisible();
  49 |   });
  50 | 
  51 |   test('Add Member form — submit disabled when name empty', async ({ page }) => {
  52 |     await page.getByText('Add Member').click();
  53 |     const submit = page.getByRole('button', { name: 'Add Member' });
  54 |     await expect(submit).toBeDisabled();
  55 |     await page.getByPlaceholder('Ahmed Al Mansoori').fill('Test User');
  56 |     await expect(submit).not.toBeDisabled();
  57 |   });
  58 | 
  59 |   test('CSV Import modal opens', async ({ page }) => {
  60 |     await page.getByText('Import CSV').click();
  61 |     await expect(page.getByText('Import Members from CSV')).toBeVisible({ timeout: 3000 });
  62 |   });
  63 | });
  64 | 
  65 | test.describe('Memberships tab UI', () => {
  66 |   test.beforeEach(async ({ page }) => {
  67 |     await page.goto('/memberships');
  68 |     await page.waitForLoadState('networkidle');
  69 |   });
  70 | 
  71 |   test('tabs and Plans render', async ({ page }) => {
  72 |     await expect(page.getByText('Memberships')).toBeVisible({ timeout: 5000 });
  73 |     await page.getByText('Plans').click();
  74 |     await expect(page.getByText('Add Plan')).toBeVisible({ timeout: 3000 });
  75 |   });
  76 | });
  77 | 
  78 | test.describe('Billing tab UI', () => {
  79 |   test.beforeEach(async ({ page }) => {
  80 |     await page.goto('/billing');
  81 |     await page.waitForLoadState('networkidle');
  82 |   });
  83 | 
  84 |   test('New Invoice button renders', async ({ page }) => {
  85 |     await expect(page.getByText('New Invoice')).toBeVisible({ timeout: 5000 });
  86 |   });
  87 | });
  88 | 
  89 | test.describe('Check-ins tab UI', () => {
  90 |   test.beforeEach(async ({ page }) => {
  91 |     await page.goto('/checkins');
  92 |     await page.waitForLoadState('networkidle');
  93 |   });
  94 | 
  95 |   test('Check In button renders', async ({ page }) => {
  96 |     await expect(page.getByText('Check In')).toBeVisible({ timeout: 5000 });
  97 |   });
  98 | });
  99 | 
```
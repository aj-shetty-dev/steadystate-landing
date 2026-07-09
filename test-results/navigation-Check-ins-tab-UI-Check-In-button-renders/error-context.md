# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: navigation.spec.ts >> Check-ins tab UI >> Check In button renders
- Location: e2e/browser/navigation.spec.ts:95:7

# Error details

```
Error: expect(locator).toBeVisible() failed

Locator: getByText('Check In')
Expected: visible
Timeout: 5000ms
Error: element(s) not found

Call log:
  - Expect "toBeVisible" with timeout 5000ms
  - waiting for getByText('Check In')

```

```yaml
- complementary:
  - text: SteadyState
  - navigation:
    - link "Overview":
      - /url: /overview
    - link "Members":
      - /url: /members
    - link "Memberships":
      - /url: /memberships
    - link "Classes":
      - /url: /classes
    - link "Check-ins":
      - /url: /checkins
    - link "POS":
      - /url: /pos
    - link "Staff":
      - /url: /staff
    - link "Billing":
      - /url: /billing
    - link "Messages":
      - /url: /messages
  - text: ET E2E Tester e2e@test.com
  - button "Switch to light mode":
    - img
  - button "Sign out"
- main: Internal Server Error
- alert
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
  20 |     await expect(page.getByText('Overview')).toBeVisible({ timeout: 5000 });
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
> 96 |     await expect(page.getByText('Check In')).toBeVisible({ timeout: 5000 });
     |                                              ^ Error: expect(locator).toBeVisible() failed
  97 |   });
  98 | });
  99 | 
```
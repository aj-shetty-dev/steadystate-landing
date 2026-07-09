/**
 * Browser Navigation E2E — Tests that all pages render under E2E_TEST_MODE.
 * Runs against the real dev server with Clerk auth bypassed.
 */
import { test, expect } from '@playwright/test';

test.describe('Dashboard navigation', () => {
  test('all dashboard pages load without auth errors', async ({ page }) => {
    const routes = ['/overview', '/members', '/memberships', '/billing', '/checkins', '/classes', '/staff', '/pos', '/messages'];
    for (const route of routes) {
      const res = await page.goto(route);
      expect(res?.status()).toBe(200);
      // Should NOT redirect to sign-in
      expect(res?.url()).not.toContain('/sign-in');
    }
  });

  test('sidebar renders all nav links', async ({ page }) => {
    await page.goto('/members');
    await expect(page.getByText('Overview')).toBeVisible({ timeout: 5000 });
    await expect(page.getByText('Members')).toBeVisible();
    await expect(page.getByText('Memberships')).toBeVisible();
    await expect(page.getByText('Classes')).toBeVisible();
    await expect(page.getByText('Check-ins')).toBeVisible();
    await expect(page.getByText('Billing')).toBeVisible();
    await expect(page.getByText('Staff')).toBeVisible();
  });
});

test.describe('Members tab UI', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/members');
    await page.waitForLoadState('networkidle');
  });

  test('page header and action buttons render', async ({ page }) => {
    await expect(page.getByText('Members')).toBeVisible({ timeout: 5000 });
    await expect(page.getByText('Add Member')).toBeVisible();
    await expect(page.getByText('Import CSV')).toBeVisible();
  });

  test('Add Member modal opens with all sections', async ({ page }) => {
    await page.getByText('Add Member').click();
    await expect(page.getByRole('dialog', { name: 'Add member' })).toBeVisible({ timeout: 3000 });
    await expect(page.getByText('Identity')).toBeVisible();
    await expect(page.getByText('Membership')).toBeVisible();
    await expect(page.getByText('Personal')).toBeVisible();
    await expect(page.getByText('Emergency Contact')).toBeVisible();
  });

  test('Add Member form — submit disabled when name empty', async ({ page }) => {
    await page.getByText('Add Member').click();
    const submit = page.getByRole('button', { name: 'Add Member' });
    await expect(submit).toBeDisabled();
    await page.getByPlaceholder('Ahmed Al Mansoori').fill('Test User');
    await expect(submit).not.toBeDisabled();
  });

  test('CSV Import modal opens', async ({ page }) => {
    await page.getByText('Import CSV').click();
    await expect(page.getByText('Import Members from CSV')).toBeVisible({ timeout: 3000 });
  });
});

test.describe('Memberships tab UI', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/memberships');
    await page.waitForLoadState('networkidle');
  });

  test('tabs and Plans render', async ({ page }) => {
    await expect(page.getByText('Memberships')).toBeVisible({ timeout: 5000 });
    await page.getByText('Plans').click();
    await expect(page.getByText('Add Plan')).toBeVisible({ timeout: 3000 });
  });
});

test.describe('Billing tab UI', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/billing');
    await page.waitForLoadState('networkidle');
  });

  test('New Invoice button renders', async ({ page }) => {
    await expect(page.getByText('New Invoice')).toBeVisible({ timeout: 5000 });
  });
});

test.describe('Check-ins tab UI', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/checkins');
    await page.waitForLoadState('networkidle');
  });

  test('Check In button renders', async ({ page }) => {
    await expect(page.getByText('Check In')).toBeVisible({ timeout: 5000 });
  });
});

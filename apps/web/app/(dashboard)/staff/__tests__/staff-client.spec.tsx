/**
 * Staff page — Workflow Tests
 */
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mockRouter = { refresh: vi.fn(), push: vi.fn() };
vi.mock('next/navigation', () => ({ useRouter: () => mockRouter }));

// The staff page is a server component that renders StaffClient, so we test StaffClient directly
// But we need to check if it's exported. Let's test the page at least minimally.
import StaffPage from '../page';

describe('Staff Page', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn(async () => ({
      ok: true,
      json: async () => [],
      clone: () => ({ json: async () => [] }),
    } as Response)));
  });
  afterEach(() => { cleanup(); vi.unstubAllGlobals(); vi.clearAllMocks(); });

  // Server components are harder to test; test rendering of the page wrapper
  it('renders without crashing (server component renders)', async () => {
    const { container } = render(await StaffPage());
    expect(container).toBeTruthy();
  });
});

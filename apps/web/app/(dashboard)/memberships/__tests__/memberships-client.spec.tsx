/**
 * MembershipsClient — Workflow Tests
 */
import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { MembershipsClient } from '../memberships-client';

const mockRouter = { refresh: vi.fn(), push: vi.fn() };
vi.mock('next/navigation', () => ({ useRouter: () => mockRouter }));

function membershipsPage(overrides = {}) {
  return { items: [
    { id: 'ms-1', memberId: 'mem-1', planId: 'p1', status: 'ACTIVE', startDate: '2026-06-01', endDate: '2026-07-01', frozenUntil: null, cancellationReason: null, createdAt: '2026-06-01', member: { id: 'mem-1', fullName: 'Ahmed Al Mansoori', phone: '+971501234567' }, plan: { id: 'p1', nameEn: 'Gold Plan', durationDays: 30, priceAed: 29900 } },
    { id: 'ms-2', memberId: 'mem-2', planId: 'p1', status: 'FROZEN', startDate: '2026-05-01', endDate: '2026-06-01', frozenUntil: '2026-06-15', cancellationReason: null, createdAt: '2026-05-01', member: { id: 'mem-2', fullName: 'Fatima Al Sayed', phone: null }, plan: { id: 'p1', nameEn: 'Gold Plan', durationDays: 30, priceAed: 29900 } },
  ], total: 2, page: 1, pageSize: 25, ...overrides };
}

const plans = [
  { id: 'p1', nameEn: 'Gold Plan', priceAed: 29900, vatRate: 5, durationDays: 30, includesClasses: true, maxFreezeDays: 10, active: true, nameAr: null, description: null, createdAt: '2026-01-01' },
  { id: 'p2', nameEn: 'Platinum', priceAed: 49900, vatRate: 5, durationDays: 60, includesClasses: true, maxFreezeDays: 20, active: true, nameAr: null, description: null, createdAt: '2026-01-01' },
];
const emptyRenewals: any[] = [];

function renderPage(props = {}) {
  return render(<MembershipsClient membershipsPage={membershipsPage()} plans={plans} upcomingRenewals={emptyRenewals} initialSearch="" initialStatus="" {...props} />);
}

describe('MembershipsClient', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: true, json: async () => ({}), clone: () => ({ json: async () => ({}) }) } as Response)));
  });
  afterEach(() => { cleanup(); vi.unstubAllGlobals(); vi.clearAllMocks(); });

  it('renders membership rows with member names', () => { renderPage(); expect(screen.getByText('Ahmed Al Mansoori')).toBeInTheDocument(); });
  it('renders plan names', () => { renderPage(); expect(screen.getAllByText('Gold Plan').length).toBeGreaterThanOrEqual(1); });
  it('renders status filter tabs', () => { renderPage(); expect(screen.getByText('Active')).toBeInTheDocument(); expect(screen.getByText('Frozen')).toBeInTheDocument(); });
  it('renders search input', () => { renderPage(); expect(screen.getByPlaceholderText(/Search by member name/)).toBeInTheDocument(); });
  it('shows Assign membership button when plans exist', () => { renderPage(); expect(screen.getByText('Assign membership')).toBeInTheDocument(); });
  it('shows Mark paid for PENDING_PAYMENT', () => {
    const pg = membershipsPage(); pg.items[0] = { ...pg.items[0], status: 'PENDING_PAYMENT' };
    render(<MembershipsClient membershipsPage={pg} plans={plans} upcomingRenewals={emptyRenewals} initialSearch="" initialStatus="" />);
    expect(screen.getByText('Mark paid')).toBeInTheDocument();
  });
  it('shows empty state when no items', () => {
    render(<MembershipsClient membershipsPage={membershipsPage({ items: [], total: 0 })} plans={plans} upcomingRenewals={emptyRenewals} initialSearch="" initialStatus="" />);
    expect(screen.getByText('No memberships yet')).toBeInTheDocument();
  });
  it('switches to Plans tab', async () => { renderPage(); await userEvent.click(screen.getByText('Plans')); expect(screen.getByText('Add Plan')).toBeInTheDocument(); });
  it('switches to Auto-Renewals tab', async () => { renderPage(); await userEvent.click(screen.getByText('Auto-Renewals')); expect(screen.getByText('No upcoming auto-renewals')).toBeInTheDocument(); });
  it('shows pagination for multi-page results', () => {
    render(<MembershipsClient membershipsPage={membershipsPage({ total: 50, page: 2 })} plans={plans} upcomingRenewals={emptyRenewals} initialSearch="" initialStatus="" />);
    expect(screen.getByText(/26–50 of 50/)).toBeInTheDocument();
  });
  it('renders price column with AED label', () => { renderPage(); expect(screen.getAllByText(/AED/).length).toBeGreaterThanOrEqual(1); });
  it('shows status badges', () => { renderPage(); expect(screen.getByText('Active')).toBeInTheDocument(); });
});

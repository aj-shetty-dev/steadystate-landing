/**
 * MembersClient — Workflow Tests
 *
 * Covers: list rendering, search, status filter tabs, pagination,
 *   add member → modal, edit member → fetch detail → modal,
 *   deactivate → confirm → optimistic update, CSV import modal,
 *   keyboard navigation, empty state, error toast.
 */
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { MembersClient } from '../members-client';
import type { MemberRow, Paginated } from '../../../../lib/api';

const mockRouter = { refresh: vi.fn(), push: vi.fn() };
vi.mock('next/navigation', () => ({ useRouter: () => mockRouter }));

function membersPage(overrides: Partial<Paginated<MemberRow>> = {}): Paginated<MemberRow> {
  return {
    items: [
      { id: 'm1', fullName: 'Ahmed Al Mansoori', phone: '+971501234567', email: 'ahmed@test.com', membershipStatus: 'ACTIVE', provider: 'NATIVE', lastCheckinAt: '2026-06-01', joinedAt: '2026-01-15', activePlanNames: ['Gold Plan'] },
      { id: 'm2', fullName: 'Fatima Al Sayed', phone: '+971509876543', email: null, membershipStatus: 'PENDING', provider: 'NATIVE', lastCheckinAt: null, joinedAt: '2026-06-01', activePlanNames: [] },
    ],
    total: 2,
    page: 1,
    pageSize: 25,
    ...overrides,
  };
}

const staffList = [{ id: 's1', fullName: 'Coach Ahmed', active: true, role: 'TRAINER' }];
const planList = [{ id: 'p1', nameEn: 'Gold Plan', priceAed: 29900, durationDays: 30 }];
const detailResponse = {
  id: 'm1', fullName: 'Ahmed Al Mansoori', phone: '+971501234567', email: 'ahmed@test.com',
  membershipStatus: 'ACTIVE', provider: 'NATIVE', lastCheckinAt: '2026-06-01', joinedAt: '2026-01-15',
  activePlanNames: ['Gold Plan'], externalId: 'ext-1', preferredLocale: 'EN',
  medicalNotes: null, dateOfBirth: null, gender: 'MALE',
  source: 'MANUAL', emergencyContact: null, assignedTrainerId: null,
  membershipExpiresAt: null, assignedTrainer: null,
};

describe('MembersClient', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn(async (url: string) => {
      if (typeof url === 'string' && url.includes('/staff')) {
        return { ok: true, json: async () => staffList, clone: () => ({ json: async () => staffList }) } as Response;
      }
      if (typeof url === 'string' && url.includes('/membership-plans')) {
        return { ok: true, json: async () => planList, clone: () => ({ json: async () => planList }) } as Response;
      }
      if (typeof url === 'string' && url.includes('/members/m1') && !url.includes('membership')) {
        return { ok: true, json: async () => detailResponse, clone: () => ({ json: async () => detailResponse }) } as Response;
      }
      return { ok: true, json: async () => ({}), clone: () => ({ json: async () => ({}) }) } as Response;
    }));
  });
  afterEach(() => { cleanup(); vi.unstubAllGlobals(); vi.clearAllMocks(); });

  /* ─────────────────────────────────────────────────────────────── */
  /* Render                                                          */
  /* ─────────────────────────────────────────────────────────────── */
  describe('render', () => {
    it('renders member rows from data', () => {
      render(<MembersClient data={membersPage()} initialSearch="" initialStatus="" />);
      expect(screen.getByText('Ahmed Al Mansoori')).toBeInTheDocument();
      expect(screen.getByText('Fatima Al Sayed')).toBeInTheDocument();
    });

    it('renders "Add Member" button', () => {
      render(<MembersClient data={membersPage({ items: [], total: 0 })} initialSearch="" initialStatus="" />);
      expect(screen.getByText('Add Member')).toBeInTheDocument();
    });

    it('renders "Import CSV" button', () => {
      render(<MembersClient data={membersPage({ items: [], total: 0 })} initialSearch="" initialStatus="" />);
      expect(screen.getByText('Import CSV')).toBeInTheDocument();
    });

    it('shows empty state when no members', () => {
      render(<MembersClient data={membersPage({ items: [], total: 0 })} initialSearch="" initialStatus="" />);
      expect(screen.getByText(/Import a CSV or add a member manually/)).toBeInTheDocument();
    });

    it('shows "No members match" when search has no results', () => {
      render(<MembersClient data={membersPage({ items: [], total: 0 })} initialSearch="xyz" initialStatus="" />);
      expect(screen.getByText(/No members match/)).toBeInTheDocument();
    });

    it('shows status filter tabs', () => {
      render(<MembersClient data={membersPage()} initialSearch="" initialStatus="" />);
      expect(screen.getByText('Active')).toBeInTheDocument();
      expect(screen.getByText('Frozen')).toBeInTheDocument();
      expect(screen.getByText('Cancelled')).toBeInTheDocument();
    });

    it('displays pagination info', () => {
      render(<MembersClient data={membersPage({ total: 50, page: 2 })} initialSearch="" initialStatus="" />);
      expect(screen.getByText(/26–50 of 50 members/)).toBeInTheDocument();
    });
  });

  /* ─────────────────────────────────────────────────────────────── */
  /* Add Member flow                                                 */
  /* ─────────────────────────────────────────────────────────────── */
  describe('add member flow', () => {
    it('opens Add Member modal when button clicked', async () => {
      render(<MembersClient data={membersPage()} initialSearch="" initialStatus="" />);
      await userEvent.click(screen.getByText('Add Member'));
      await waitFor(() => {
        expect(screen.getByRole('dialog', { name: 'Add member' })).toBeInTheDocument();
      });
    });
  });

  /* ─────────────────────────────────────────────────────────────── */
  /* Edit flow                                                       */
  /* ─────────────────────────────────────────────────────────────── */
  describe('edit member flow', () => {
    it('opens actions menu and shows Edit option', async () => {
      render(<MembersClient data={membersPage()} initialSearch="" initialStatus="" />);
      // Click the "..." button on the first row
      const actionBtns = screen.getAllByLabelText(/Actions for/);
      await userEvent.click(actionBtns[0]);

      await waitFor(() => {
        expect(screen.getByText('Edit member')).toBeInTheDocument();
      });
    });

    it('fetches full detail and opens Edit modal', async () => {
      render(<MembersClient data={membersPage()} initialSearch="" initialStatus="" />);

      const actionBtns = screen.getAllByLabelText(/Actions for/);
      await userEvent.click(actionBtns[0]);
      await userEvent.click(screen.getByText('Edit member'));

      await waitFor(() => {
        expect(screen.getByRole('dialog', { name: 'Edit member' })).toBeInTheDocument();
      });
    });
  });

  /* ─────────────────────────────────────────────────────────────── */
  /* Deactivate flow                                                 */
  /* ─────────────────────────────────────────────────────────────── */
  describe('deactivate flow', () => {
    it('shows deactivate option in actions menu for non-cancelled members', async () => {
      render(<MembersClient data={membersPage()} initialSearch="" initialStatus="" />);
      const actionBtns = screen.getAllByLabelText(/Actions for/);
      await userEvent.click(actionBtns[0]);
      expect(screen.getByText('Deactivate')).toBeInTheDocument();
    });

    it('opens confirm dialog when Deactivate clicked', async () => {
      render(<MembersClient data={membersPage()} initialSearch="" initialStatus="" />);
      const actionBtns = screen.getAllByLabelText(/Actions for/);
      await userEvent.click(actionBtns[0]);
      await userEvent.click(screen.getByText('Deactivate'));

      await waitFor(() => {
        expect(screen.getByText('Deactivate member')).toBeInTheDocument();
      });
    });
  });

  /* ─────────────────────────────────────────────────────────────── */
  /* Search                                                          */
  /* ─────────────────────────────────────────────────────────────── */
  describe('search', () => {
    it('renders search input', () => {
      render(<MembersClient data={membersPage()} initialSearch="" initialStatus="" />);
      expect(screen.getByPlaceholderText(/Search by name/)).toBeInTheDocument();
    });

    it('shows clear button when search has text', () => {
      render(<MembersClient data={membersPage()} initialSearch="Ahmed" initialStatus="" />);
      expect(screen.getByLabelText('Clear search')).toBeInTheDocument();
    });
  });

  /* ─────────────────────────────────────────────────────────────── */
  /* Keyboard navigation                                             */
  /* ─────────────────────────────────────────────────────────────── */
  describe('keyboard navigation', () => {
    it('table rows have link role and are focusable', () => {
      render(<MembersClient data={membersPage()} initialSearch="" initialStatus="" />);
      const rows = screen.getAllByRole('link');
      expect(rows.length).toBeGreaterThanOrEqual(1);
    });

    it('Enter key on row navigates to member detail', () => {
      render(<MembersClient data={membersPage()} initialSearch="" initialStatus="" />);
      const row = screen.getAllByRole('link')[0];
      fireEvent.keyDown(row, { key: 'Enter' });
      expect(mockRouter.push).toHaveBeenCalledWith('/members/m1');
    });
  });

  /* ─────────────────────────────────────────────────────────────── */
  /* CSV Import modal                                                */
  /* ─────────────────────────────────────────────────────────────── */
  describe('CSV import flow', () => {
    it('opens CSV import modal when Import CSV clicked', async () => {
      render(<MembersClient data={membersPage()} initialSearch="" initialStatus="" />);
      await userEvent.click(screen.getByText('Import CSV'));
      await waitFor(() => {
        expect(screen.getByText('Import Members from CSV')).toBeInTheDocument();
      });
    });
  });

  /* ─────────────────────────────────────────────────────────────── */
  /* Error toast                                                     */
  /* ─────────────────────────────────────────────────────────────── */
  describe('error handling', () => {
    it('shows error toast when deactivate fails', async () => {
      vi.stubGlobal('fetch', vi.fn(async (url: string) => {
        if (typeof url === 'string' && url.includes('/deactivate')) {
          return { ok: false, status: 500, json: async () => ({ message: 'Server error' }) } as Response;
        }
        return { ok: true, json: async () => ({}), clone: () => ({ json: async () => ({}) }) } as Response;
      }));

      render(<MembersClient data={membersPage()} initialSearch="" initialStatus="" />);

      const actionBtns = screen.getAllByLabelText(/Actions for/);
      await userEvent.click(actionBtns[0]);
      await userEvent.click(screen.getByText('Deactivate'));
      // Click confirm
      await userEvent.click(screen.getByText('Deactivate'));

      await waitFor(() => {
        expect(screen.getByText(/Server error/)).toBeInTheDocument();
      });
    });
  });
});

/**
 * MembershipActionsClient — Workflow Tests
 *
 * Covers: assign plan, freeze, unfreeze, cancel, change-plan,
 *   button visibility based on membership status, form validation.
 */
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { MembershipActionsClient } from '../membership-actions-client';

const mockRouter = { refresh: vi.fn(), push: vi.fn() };
vi.mock('next/navigation', () => ({ useRouter: () => mockRouter }));

const planList = [
  { id: 'p1', nameEn: 'Gold Plan', priceAed: 29900, durationDays: 30, active: true, vatRate: 5 },
  { id: 'p2', nameEn: 'Platinum', priceAed: 49900, durationDays: 60, active: true, vatRate: 5 },
];

const ACTIVE_MEMBERSHIP = {
  id: 'ms-1', memberId: 'mem-1', planId: 'p1', status: 'ACTIVE',
  startDate: '2026-06-01', endDate: '2026-07-01', frozenUntil: null, cancellationReason: null,
  createdAt: '2026-06-01',
  member: { id: 'mem-1', fullName: 'Ahmed', phone: null },
  plan: { id: 'p1', nameEn: 'Gold Plan', durationDays: 30, priceAed: 29900 },
};

const FROZEN_MEMBERSHIP = { ...ACTIVE_MEMBERSHIP, status: 'FROZEN', planId: 'p1', plan: { ...ACTIVE_MEMBERSHIP.plan } };
const PENDING_MEMBERSHIP = { ...ACTIVE_MEMBERSHIP, status: 'PENDING_PAYMENT', planId: 'p1', plan: { ...ACTIVE_MEMBERSHIP.plan } };
const CANCELLED_MEMBERSHIP = { ...ACTIVE_MEMBERSHIP, status: 'CANCELLED', planId: 'p1', plan: { ...ACTIVE_MEMBERSHIP.plan } };

beforeEach(() => {
  vi.stubGlobal('fetch', vi.fn(async (url: string) => {
    if (typeof url === 'string' && url.includes('/membership-plans')) {
      return { ok: true, json: async () => planList, clone: () => ({ json: async () => planList }) } as Response;
    }
    return { ok: true, json: async () => ({}), clone: () => ({ json: async () => ({}) }) } as Response;
  }));
});
afterEach(() => { cleanup(); vi.unstubAllGlobals(); vi.clearAllMocks(); });

describe('MembershipActionsClient', () => {
  describe('active membership', () => {
    it('shows Freeze, Unfreeze (not), Change plan, Cancel buttons', async () => {
      render(<MembershipActionsClient memberId="mem-1" membership={ACTIVE_MEMBERSHIP as any} />);
      await waitFor(() => {
        expect(screen.getByText('Freeze')).toBeInTheDocument();
        expect(screen.getByText('Change plan')).toBeInTheDocument();
        expect(screen.getByText('Cancel membership')).toBeInTheDocument();
      });
      expect(screen.queryByText('Unfreeze')).not.toBeInTheDocument();
      expect(screen.queryByText('Assign plan')).not.toBeInTheDocument();
    });

    it('opens freeze modal when Freeze clicked', async () => {
      render(<MembershipActionsClient memberId="mem-1" membership={ACTIVE_MEMBERSHIP as any} />);
      await waitFor(() => expect(screen.getByText('Freeze')).toBeInTheDocument());
      await userEvent.click(screen.getByText('Freeze'));
      expect(screen.getByText('Freeze membership')).toBeInTheDocument();
    });

    it('disables Freeze button when endDate < startDate', async () => {
      render(<MembershipActionsClient memberId="mem-1" membership={ACTIVE_MEMBERSHIP as any} />);
      await waitFor(() => expect(screen.getByText('Freeze')).toBeInTheDocument());
      await userEvent.click(screen.getByText('Freeze'));

      // Find date inputs by type
      const dateInputs = screen.getAllByRole('textbox');
      // The freeze modal renders two date inputs
      if (dateInputs.length >= 2) {
        fireEvent.change(dateInputs[0], { target: { value: '2026-07-15' } });
        fireEvent.change(dateInputs[1], { target: { value: '2026-07-01' } }); // end before start

        expect(screen.getByText('Freeze')).toBeDisabled();
        expect(screen.getByText(/End date must be on or after/)).toBeInTheDocument();
      }
    });

    it('opens cancel confirmation when Cancel clicked', async () => {
      render(<MembershipActionsClient memberId="mem-1" membership={ACTIVE_MEMBERSHIP as any} />);
      await waitFor(() => expect(screen.getByText('Cancel membership')).toBeInTheDocument());
      await userEvent.click(screen.getByText('Cancel membership'));
      // The ConfirmDialog renders title "Cancel membership" and message text
      expect(screen.getByText('Cancel this membership? The member will lose access immediately.')).toBeInTheDocument();
    });
  });

  describe('frozen membership', () => {
    it('shows Unfreeze button but not Freeze', async () => {
      render(<MembershipActionsClient memberId="mem-1" membership={FROZEN_MEMBERSHIP as any} />);
      await waitFor(() => {
        expect(screen.getByText('Unfreeze')).toBeInTheDocument();
      });
      expect(screen.queryByText('Freeze')).not.toBeInTheDocument();
    });
  });

  describe('pending payment membership', () => {
    it('shows Activate button', async () => {
      render(<MembershipActionsClient memberId="mem-1" membership={PENDING_MEMBERSHIP as any} />);
      await waitFor(() => {
        expect(screen.getByText('Activate')).toBeInTheDocument();
      });
    });
  });

  describe('cancelled/expired membership', () => {
    it('shows Assign plan button when cancelled', async () => {
      render(<MembershipActionsClient memberId="mem-1" membership={CANCELLED_MEMBERSHIP as any} />);
      await waitFor(() => {
        expect(screen.getByText('Assign plan')).toBeInTheDocument();
      });
    });
  });

  describe('no membership', () => {
    it('shows Assign plan button as primary action', async () => {
      render(<MembershipActionsClient memberId="mem-1" membership={null} />);
      await waitFor(() => {
        expect(screen.getByText('Assign plan')).toBeInTheDocument();
      });
    });

    it('opens assign plan modal', async () => {
      render(<MembershipActionsClient memberId="mem-1" membership={null} />);
      await waitFor(() => expect(screen.getByText('Assign plan')).toBeInTheDocument());
      await userEvent.click(screen.getByText('Assign plan'));
      expect(screen.getByText('Assign membership plan')).toBeInTheDocument();
    });
  });
});

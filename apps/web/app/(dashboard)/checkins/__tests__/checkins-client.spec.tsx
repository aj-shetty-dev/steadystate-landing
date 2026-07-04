/**
 * CheckinsClient — Workflow Tests
 */
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { CheckinsClient } from '../checkins-client';

const mockRouter = { refresh: vi.fn(), push: vi.fn() };
vi.mock('next/navigation', () => ({ useRouter: () => mockRouter }));

const sampleItems = [
  { id: 'ci-1', memberId: 'mem-1', source: 'MANUAL', checkedInAt: new Date().toISOString(), staffId: null, sessionId: null, member: { id: 'mem-1', fullName: 'Ahmed Al Mansoori' } },
  { id: 'ci-2', memberId: 'mem-2', source: 'KIOSK_PIN', checkedInAt: new Date().toISOString(), staffId: 'st-1', sessionId: 'sess-1', member: { id: 'mem-2', fullName: 'Fatima Al Sayed' } },
];

describe('CheckinsClient', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn(async () => ({
      ok: true, json: async () => ({}), clone: () => ({ json: async () => ({}) }),
    } as Response)));
  });
  afterEach(() => { cleanup(); vi.unstubAllGlobals(); vi.clearAllMocks(); });

  describe('render', () => {
    it('renders check-in rows with member names', () => {
      render(<CheckinsClient items={sampleItems as any} />);
      expect(screen.getByText('Ahmed Al Mansoori')).toBeInTheDocument();
      expect(screen.getByText('Fatima Al Sayed')).toBeInTheDocument();
    });

    it('shows source badges', () => {
      render(<CheckinsClient items={sampleItems as any} />);
      expect(screen.getByText('MANUAL')).toBeInTheDocument();
      expect(screen.getByText('KIOSK_PIN')).toBeInTheDocument();
    });

    it('shows empty state when no check-ins', () => {
      render(<CheckinsClient items={[]} />);
      expect(screen.getByText('No check-ins yet')).toBeInTheDocument();
    });

    it('renders Check In and Refresh buttons', () => {
      render(<CheckinsClient items={[]} />);
      expect(screen.getByText('Check In')).toBeInTheDocument();
      expect(screen.getByText('Refresh')).toBeInTheDocument();
    });
  });

  describe('manual check-in flow', () => {
    it('opens manual check-in modal', async () => {
      render(<CheckinsClient items={sampleItems as any} />);
      await userEvent.click(screen.getByText('Check In'));
      expect(screen.getByText('Manual Check-in')).toBeInTheDocument();
      expect(screen.getByPlaceholderText(/Search member by name/)).toBeInTheDocument();
    });

    it('closes modal when X clicked', async () => {
      render(<CheckinsClient items={sampleItems as any} />);
      await userEvent.click(screen.getByText('Check In'));
      await userEvent.click(screen.getByRole('button', { name: '' })); // X button
      await waitFor(() => {
        expect(screen.queryByText('Manual Check-in')).not.toBeInTheDocument();
      });
    });

    it('searches members when typing in modal', async () => {
      vi.stubGlobal('fetch', vi.fn(async (url: string) => {
        if (typeof url === 'string' && url.includes('/members')) {
          return {
            ok: true,
            json: async () => ({ items: [{ id: 'mem-1', fullName: 'Ahmed', phone: '+971501234567', membershipStatus: 'ACTIVE' }] }),
            clone: () => ({ json: async () => ({ items: [] }) }),
          } as Response;
        }
        return { ok: true, json: async () => ({}) } as Response;
      }));

      render(<CheckinsClient items={sampleItems as any} />);
      await userEvent.click(screen.getByText('Check In'));
      const searchInput = screen.getByPlaceholderText(/Search member by name/);
      fireEvent.change(searchInput, { target: { value: 'Ahmed' } });

      await waitFor(() => {
        expect(screen.getByText('Ahmed')).toBeInTheDocument();
      });
    });
  });
});

import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { StaffClient } from '../staff-client';

const mockRouter = { refresh: vi.fn(), push: vi.fn() };
vi.mock('next/navigation', () => ({ useRouter: () => mockRouter }));

const staffList = [
  { id: 's1', fullName: 'Coach Ahmed', email: 'ahmed@gym.com', phone: '+971501234567', role: 'TRAINER', active: true, hourlyRateAed: 7500, commissionPercent: 10, color: '#22c55e', hiredAt: '2026-01-01', userId: null, terminatedAt: null, pinHash: null },
  { id: 's2', fullName: 'Sara Reception', email: null, phone: '+971509876543', role: 'RECEPTION', active: true, hourlyRateAed: 5000, commissionPercent: null, color: '#3b82f6', hiredAt: '2026-02-01', userId: null, terminatedAt: null, pinHash: null },
];

describe('StaffClient', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: true, json: async () => ({}), clone: () => ({ json: async () => ({}) }) } as Response)));
  });
  afterEach(() => { cleanup(); vi.unstubAllGlobals(); vi.clearAllMocks(); });

  it('renders staff names', () => { render(<StaffClient staff={staffList} initialError={null} />); expect(screen.getByText('Coach Ahmed')).toBeInTheDocument(); });
  it('shows error when provided', () => { render(<StaffClient staff={[]} initialError="Failed to load staff" />); expect(screen.getByText('Failed to load staff')).toBeInTheDocument(); });
  it('shows empty state when no staff', () => { render(<StaffClient staff={[]} initialError={null} />); expect(screen.getByText('No staff yet')).toBeInTheDocument(); });
});

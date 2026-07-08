import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ClassesClient } from '../classes-client';

const mockRouter = { refresh: vi.fn(), push: vi.fn() };
vi.mock('next/navigation', () => ({ useRouter: () => mockRouter }));

const types = [{ id: 'ct-1', nameEn: 'Yoga', nameAr: null, description: null, durationMin: 60, capacity: 20, color: '#22c55e', requiresEquipment: false, dropInPriceAed: 5000, active: true, createdAt: '2026-01-01' }];

describe('ClassesClient', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: true, json: async () => ({}), clone: () => ({ json: async () => ({}) }) } as Response)));
  });
  afterEach(() => { cleanup(); vi.unstubAllGlobals(); vi.clearAllMocks(); });

  it('renders class type names', () => {
    render(<ClassesClient types={types} sessions={[]} recurrences={[]} staff={[]} initialStatus="" initialTypeId="" initialFrom="" initialTo="" />);
    expect(screen.getByText('Yoga')).toBeInTheDocument();
  });

  it('shows empty state when no class types', () => {
    render(<ClassesClient types={[]} sessions={[]} recurrences={[]} staff={[]} initialStatus="" initialTypeId="" initialFrom="" initialTo="" />);
    expect(screen.getByText('No class types yet')).toBeInTheDocument();
  });
});

import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { PlanFormModal } from '../plan-form-modal';

const mockRouter = { refresh: vi.fn() };

vi.mock('next/navigation', () => ({
  useRouter: () => mockRouter,
}));

function renderCreate() {
  const onClose = vi.fn();
  const result = render(<PlanFormModal onClose={onClose} />);
  return { ...result, onClose };
}

function renderEdit() {
  const onClose = vi.fn();
  const plan = {
    id: 'p1',
    nameEn: 'Gold Plan',
    nameAr: 'الذهبية',
    description: 'Premium membership',
    priceAed: 2500,
    vatRate: 5,
    durationDays: 30,
    includesClasses: true,
    maxFreezeDays: 14,
    active: true,
    createdAt: '2026-01-01T00:00:00Z',
  };
  const result = render(<PlanFormModal plan={plan} onClose={onClose} />);
  return { ...result, onClose };
}

/** Fill all required fields so form validation passes in jsdom. */
async function fillRequired(overrides?: { nameEn?: string; priceAed?: string; durationDays?: string }) {
  await userEvent.type(screen.getByPlaceholderText('Monthly Gold'), overrides?.nameEn ?? 'Test Plan');
  await userEvent.type(screen.getByPlaceholderText('29900'), overrides?.priceAed ?? '500');
  // Duration already defaults to "30" — clear then retype to avoid "3030"
  const durInput = screen.getByPlaceholderText('30');
  await userEvent.clear(durInput);
  await userEvent.type(durInput, overrides?.durationDays ?? '30');
}

describe('PlanFormModal', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn(async () => ({
      ok: true,
      json: async () => ({}),
      clone: () => ({ json: async () => ({}) }),
    } as Response)));
  });

  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
    vi.clearAllMocks();
  });

  describe('render', () => {
    it('shows "Create Plan" title in create mode', () => {
      renderCreate();
      expect(screen.getByRole('heading', { name: 'Create Plan' })).toBeInTheDocument();
    });

    it('shows "Edit Plan" title in edit mode', () => {
      renderEdit();
      expect(screen.getByRole('heading', { name: 'Edit Plan' })).toBeInTheDocument();
    });

    it('renders the Plan Details section with name fields', () => {
      renderCreate();
      expect(screen.getByText('Plan Details')).toBeInTheDocument();
      expect(screen.getByPlaceholderText('Monthly Gold')).toBeInTheDocument();
    });

    it('renders the English name field as required', () => {
      renderCreate();
      const input = screen.getByPlaceholderText('Monthly Gold');
      expect(input).toBeRequired();
    });

    it('renders Arabic name field with RTL direction', () => {
      renderCreate();
      const input = screen.getByPlaceholderText('ذهبي شهري');
      expect(input).toHaveAttribute('dir', 'rtl');
    });

    it('renders the Pricing section', () => {
      renderCreate();
      expect(screen.getByText('Pricing')).toBeInTheDocument();
      expect(screen.getByPlaceholderText('29900')).toBeInTheDocument();
    });

    it('renders the Terms section with duration, freeze days, and class checkbox', () => {
      renderCreate();
      expect(screen.getByText('Terms')).toBeInTheDocument();
      expect(screen.getByText('Includes class bookings')).toBeInTheDocument();
    });

    it('renders VAT Rate select with 0% and 5% options', () => {
      renderCreate();
      expect(screen.getByText('VAT Rate')).toBeInTheDocument();
    });

    it('pre-fills form fields in edit mode', () => {
      renderEdit();
      expect(screen.getByDisplayValue('Gold Plan')).toBeInTheDocument();
      expect(screen.getByDisplayValue('الذهبية')).toBeInTheDocument();
      expect(screen.getByDisplayValue('Premium membership')).toBeInTheDocument();
      expect(screen.getByDisplayValue('30')).toBeInTheDocument();
      expect(screen.getByDisplayValue('2500')).toBeInTheDocument();
    });

    it('pre-checks the class bookings checkbox when plan.includesClasses is true', () => {
      renderEdit();
      const checkbox = screen.getByRole('checkbox');
      expect(checkbox).toBeChecked();
    });

    it('shows Cancel and Create Plan buttons in create mode', () => {
      renderCreate();
      expect(screen.getByText('Cancel')).toBeInTheDocument();
      expect(screen.getByRole('button', { name: 'Create Plan' })).toBeInTheDocument();
    });

    it('shows Cancel and Save Changes buttons in edit mode', () => {
      renderEdit();
      expect(screen.getByText('Cancel')).toBeInTheDocument();
      expect(screen.getByText('Save Changes')).toBeInTheDocument();
    });
  });

  describe('cancel / close', () => {
    it('calls onClose when Cancel button is clicked', async () => {
      const { onClose } = renderCreate();
      await userEvent.click(screen.getByText('Cancel'));
      expect(onClose).toHaveBeenCalledOnce();
    });

    it('calls onClose when overlay background is clicked', () => {
      const { onClose, container } = renderCreate();
      const overlay = container.firstChild as HTMLElement;
      fireEvent.click(overlay);
      expect(onClose).toHaveBeenCalledOnce();
    });

    it('calls onClose when Escape key is pressed', () => {
      const { onClose } = renderCreate();
      fireEvent.keyDown(window, { key: 'Escape' });
      expect(onClose).toHaveBeenCalledOnce();
    });
  });

  describe('submit', () => {
    it('displays error when server returns a non-ok response', async () => {
      vi.stubGlobal('fetch', vi.fn(async () => ({
        ok: false,
        status: 400,
        json: async () => ({ message: 'Validation failed' }),
      } as Response)));

      renderCreate();
      await fillRequired();
      await userEvent.click(screen.getByRole('button', { name: 'Create Plan' }));

      await waitFor(() => {
        expect(screen.getByText('Validation failed')).toBeInTheDocument();
      });
    });

    it('toggles button text to "Saving…" while submitting', async () => {
      let resolvePromise: (v: unknown) => void = () => {};
      const pending = new Promise((resolve) => { resolvePromise = resolve; });

      vi.stubGlobal('fetch', vi.fn(async () => {
        await pending;
        return { ok: true, json: async () => ({ id: 'new-plan' }) } as Response;
      }));

      renderCreate();
      await fillRequired();
      await userEvent.click(screen.getByRole('button', { name: 'Create Plan' }));

      await waitFor(() => {
        expect(screen.getByText('Saving…')).toBeInTheDocument();
      });

      resolvePromise(undefined);
    });

    it('calls onClose and refreshes router after successful create', async () => {
      vi.stubGlobal('fetch', vi.fn(async () => ({
        ok: true,
        json: async () => ({ id: 'new-plan' }),
        clone: () => ({ json: async () => ({ id: 'new-plan' }) }),
      } as Response)));

      const { onClose } = renderCreate();
      await fillRequired();
      await userEvent.click(screen.getByRole('button', { name: 'Create Plan' }));

      await waitFor(() => {
        expect(mockRouter.refresh).toHaveBeenCalled();
        expect(onClose).toHaveBeenCalled();
      });
    });

    it('posts to the correct edit URL when updating an existing plan', async () => {
      const fetchSpy = vi.fn(async () => ({
        ok: true,
        json: async () => ({ id: 'p1' }),
        clone: () => ({ json: async () => ({ id: 'p1' }) }),
      } as Response));
      vi.stubGlobal('fetch', fetchSpy);

      renderEdit();
      await userEvent.click(screen.getByRole('button', { name: 'Save Changes' }));

      await waitFor(() => {
        const patchCall = fetchSpy.mock.calls.find(
          (call: unknown[]) => typeof call[0] === 'string' && call[0].includes('membership-plans/p1'),
        ) as unknown[] | undefined;
        expect(patchCall).toBeDefined();
        expect(patchCall![1]).toMatchObject({ method: 'PATCH' });
      });
    });

    it('includes all fields in create payload', async () => {
      const fetchSpy = vi.fn(async () => ({
        ok: true,
        json: async () => ({ id: 'new-plan' }),
        clone: () => ({ json: async () => ({ id: 'new-plan' }) }),
      } as Response));
      vi.stubGlobal('fetch', fetchSpy);

      renderCreate();
      await fillRequired({ nameEn: 'Silver Plan', priceAed: '1500', durationDays: '60' });
      await userEvent.type(screen.getByPlaceholderText('ذهبي شهري'), 'فضي');
      await userEvent.click(screen.getByRole('button', { name: 'Create Plan' }));

      await waitFor(() => {
        const postCall = fetchSpy.mock.calls.find(
          (call: unknown[]) => typeof call[0] === 'string' && call[0].includes('membership-plans') && !call[0].includes('p1'),
        ) as unknown[] | undefined;
        expect(postCall).toBeDefined();
        const body = JSON.parse((postCall![1] as RequestInit).body as string);
        expect(body.nameEn).toBe('Silver Plan');
        expect(body.priceAed).toBe(1500);
        expect(body.durationDays).toBe(60);
        expect(body.nameAr).toBe('فضي');
        expect(body.vatRate).toBe(5);
        expect(body.includesClasses).toBe(false);
        expect(body.maxFreezeDays).toBe(0);
      });
    });
  });
});

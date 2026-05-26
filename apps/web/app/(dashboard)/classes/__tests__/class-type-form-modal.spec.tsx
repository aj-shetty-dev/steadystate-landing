import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ClassTypeFormModal } from '../class-type-form-modal';

const mockRouter = { refresh: vi.fn() };

vi.mock('next/navigation', () => ({
  useRouter: () => mockRouter,
}));

function renderCreate() {
  const onClose = vi.fn();
  const result = render(<ClassTypeFormModal onClose={onClose} />);
  return { ...result, onClose };
}

function renderEdit() {
  const onClose = vi.fn();
  const classType = {
    id: 'ct1',
    nameEn: 'Yoga Flow',
    nameAr: 'يوغا',
    description: 'A relaxing yoga class',
    durationMin: 60,
    capacity: 20,
    color: '#3b82f6',
    requiresEquipment: true,
    dropInPriceAed: 75,
    active: true,
    createdAt: '2026-01-01T00:00:00Z',
  };
  const result = render(<ClassTypeFormModal type={classType} onClose={onClose} />);
  return { ...result, onClose };
}

describe('ClassTypeFormModal', () => {
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
    it('shows "New class type" title in create mode', () => {
      renderCreate();
      expect(screen.getByRole('heading', { name: 'New class type' })).toBeInTheDocument();
    });

    it('shows "Edit class type" title in edit mode', () => {
      renderEdit();
      expect(screen.getByRole('heading', { name: 'Edit class type' })).toBeInTheDocument();
    });

    it('renders name fields (EN required, AR with RTL)', () => {
      renderCreate();
      expect(screen.getByPlaceholderText('e.g. Yoga Flow')).toBeRequired();
      const arInput = screen.getByPlaceholderText('بالعربية');
      expect(arInput).toHaveAttribute('dir', 'rtl');
    });

    it('renders duration and capacity number inputs with defaults', () => {
      renderCreate();
      expect(screen.getByDisplayValue('60')).toBeInTheDocument(); // default duration
      expect(screen.getByDisplayValue('20')).toBeInTheDocument(); // default capacity
    });

    it('renders drop-in price and color fields', () => {
      renderCreate();
      expect(screen.getByPlaceholderText('Leave blank if N/A')).toBeInTheDocument();
      expect(screen.getByPlaceholderText('#22c55e')).toBeInTheDocument();
    });

    it('renders the requires equipment checkbox', () => {
      renderCreate();
      expect(screen.getByText('Requires equipment')).toBeInTheDocument();
    });

    it('renders color preset swatches', () => {
      renderCreate();
      // All 8 preset color buttons are rendered as colored circles
      const swatches = document.querySelectorAll('.w-5.h-5.rounded-full');
      expect(swatches.length).toBe(8);
    });

    it('pre-fills form fields in edit mode', () => {
      renderEdit();
      expect(screen.getByDisplayValue('Yoga Flow')).toBeInTheDocument();
      expect(screen.getByDisplayValue('يوغا')).toBeInTheDocument();
      expect(screen.getByDisplayValue('A relaxing yoga class')).toBeInTheDocument();
      expect(screen.getByDisplayValue('60')).toBeInTheDocument();
      expect(screen.getByDisplayValue('20')).toBeInTheDocument();
      expect(screen.getByDisplayValue('75')).toBeInTheDocument();
    });

    it('pre-checks equipment checkbox when type.requiresEquipment is true', () => {
      renderEdit();
      const checkbox = screen.getByRole('checkbox');
      expect(checkbox).toBeChecked();
    });

    it('shows Cancel and Create buttons in create mode', () => {
      renderCreate();
      expect(screen.getByText('Cancel')).toBeInTheDocument();
      expect(screen.getByRole('button', { name: 'Create' })).toBeInTheDocument();
    });

    it('shows Cancel and Save changes buttons in edit mode', () => {
      renderEdit();
      expect(screen.getByText('Cancel')).toBeInTheDocument();
      expect(screen.getByRole('button', { name: 'Save changes' })).toBeInTheDocument();
    });
  });

  describe('cancel / close', () => {
    it('calls onClose when Cancel button is clicked', async () => {
      const { onClose } = renderCreate();
      await userEvent.click(screen.getByText('Cancel'));
      expect(onClose).toHaveBeenCalledOnce();
    });

    it('calls onClose when X close button is clicked', async () => {
      const { onClose } = renderCreate();
      await userEvent.click(screen.getByText('×'));
      expect(onClose).toHaveBeenCalledOnce();
    });
  });

  describe('submit', () => {
    it('displays error when server returns a non-ok response', async () => {
      vi.stubGlobal('fetch', vi.fn(async () => ({
        ok: false,
        status: 400,
        json: async () => ({ message: 'Name already taken' }),
      } as Response)));

      renderCreate();
      await userEvent.type(screen.getByPlaceholderText('e.g. Yoga Flow'), 'Pilates');
      await userEvent.click(screen.getByRole('button', { name: 'Create' }));

      await waitFor(() => {
        expect(screen.getByText('Name already taken')).toBeInTheDocument();
      });
    });

    it('toggles button text to "Saving…" while submitting', async () => {
      let resolvePromise: (v: unknown) => void = () => {};
      const pending = new Promise((resolve) => { resolvePromise = resolve; });

      vi.stubGlobal('fetch', vi.fn(async () => {
        await pending;
        return { ok: true, json: async () => ({ id: 'new-type' }) } as Response;
      }));

      renderCreate();
      await userEvent.type(screen.getByPlaceholderText('e.g. Yoga Flow'), 'Pilates');
      await userEvent.click(screen.getByRole('button', { name: 'Create' }));

      await waitFor(() => {
        expect(screen.getByText('Saving…')).toBeInTheDocument();
      });

      resolvePromise(undefined);
    });

    it('calls onClose and refreshes router after successful create', async () => {
      vi.stubGlobal('fetch', vi.fn(async () => ({
        ok: true,
        json: async () => ({ id: 'new-type' }),
        clone: () => ({ json: async () => ({ id: 'new-type' }) }),
      } as Response)));

      const { onClose } = renderCreate();
      await userEvent.type(screen.getByPlaceholderText('e.g. Yoga Flow'), 'Pilates');
      await userEvent.click(screen.getByRole('button', { name: 'Create' }));

      await waitFor(() => {
        expect(mockRouter.refresh).toHaveBeenCalled();
        expect(onClose).toHaveBeenCalled();
      });
    });

    it('posts to the correct PATCH URL when editing', async () => {
      const fetchSpy = vi.fn(async () => ({
        ok: true,
        json: async () => ({ id: 'ct1' }),
        clone: () => ({ json: async () => ({ id: 'ct1' }) }),
      } as Response));
      vi.stubGlobal('fetch', fetchSpy);

      renderEdit();
      await userEvent.click(screen.getByRole('button', { name: 'Save changes' }));

      await waitFor(() => {
        const patchCall = fetchSpy.mock.calls.find(
          (call: unknown[]) => typeof call[0] === 'string' && call[0].includes('classes/types/ct1'),
        );
        expect(patchCall).toBeDefined();
        expect(patchCall![1]).toMatchObject({ method: 'PATCH' });
      });
    });

    it('includes all form fields in create payload', async () => {
      const fetchSpy = vi.fn(async () => ({
        ok: true,
        json: async () => ({ id: 'new-type' }),
        clone: () => ({ json: async () => ({ id: 'new-type' }) }),
      } as Response));
      vi.stubGlobal('fetch', fetchSpy);

      renderCreate();
      await userEvent.type(screen.getByPlaceholderText('e.g. Yoga Flow'), 'HIIT');
      await userEvent.type(screen.getByPlaceholderText('بالعربية'), 'هيت');
      await userEvent.type(screen.getByPlaceholderText('Optional description…'), 'High intensity');
      // durationMin defaults to 60, capacity defaults to 20
      await userEvent.type(screen.getByPlaceholderText('Leave blank if N/A'), '100');

      // Check the equipment checkbox
      const checkbox = screen.getByRole('checkbox');
      await userEvent.click(checkbox);

      await userEvent.click(screen.getByRole('button', { name: 'Create' }));

      await waitFor(() => {
        const postCall = fetchSpy.mock.calls.find(
          (call: unknown[]) => typeof call[0] === 'string' && call[0].includes('classes/types') && !call[0].includes('ct1'),
        );
        expect(postCall).toBeDefined();
        const body = JSON.parse(postCall![1]!.body as string);
        expect(body.nameEn).toBe('HIIT');
        expect(body.nameAr).toBe('هيت');
        expect(body.description).toBe('High intensity');
        expect(body.durationMin).toBe(60);
        expect(body.capacity).toBe(20);
        expect(body.dropInPriceAed).toBe(100);
        expect(body.requiresEquipment).toBe(true);
        expect(body.color).toBe('#22c55e');
      });
    });
  });
});

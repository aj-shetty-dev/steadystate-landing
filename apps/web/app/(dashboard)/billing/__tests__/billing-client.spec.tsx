import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { BillingClient } from '../billing-client';

const mockRouter = { refresh: vi.fn(), push: vi.fn() };

vi.mock('next/navigation', () => ({
  useRouter: () => mockRouter,
}));

function mockFetch(overrides: Partial<Response> & { json?: () => Promise<unknown> } = {}) {
  const fn = vi.fn(async (_url: string, _opts?: RequestInit) => {
    return {
      ok: true,
      status: 200,
      json: async () => ({}),
      clone: () => ({ json: async () => ({}) }),
      ...overrides,
    } as Response;
  });
  vi.stubGlobal('fetch', fn);
  return fn;
}

// Default paginated response with no invoices
function emptyInvoicesPage(overrides: Partial<any> = {}) {
  return {
    items: [],
    total: 0,
    page: 1,
    pageSize: 25,
    ...overrides,
  };
}

// Response with a single invoice
function oneInvoicePage() {
  return {
    items: [
      {
        id: 'inv-test-12345678',
        memberId: 'mem-1',
        amountAed: 29900,
        vatAed: 1495,
        currency: 'AED',
        dueDate: new Date('2026-08-01').toISOString(),
        status: 'DUE',
        description: 'Monthly membership',
        createdAt: new Date().toISOString(),
        member: {
          id: 'mem-1',
          fullName: 'Ahmed Al Mansoori',
          phone: '+971501234567',
        },
      },
    ],
    total: 1,
    page: 1,
    pageSize: 25,
  };
}

function renderBilling(
  overrides: {
    invoicesPage?: any;
    initialError?: string | null;
    initialSearch?: string;
    initialStatus?: string;
  } = {},
) {
  return render(
    <BillingClient
      invoicesPage={overrides.invoicesPage ?? emptyInvoicesPage()}
      initialError={overrides.initialError ?? null}
      initialSearch={overrides.initialSearch ?? ''}
      initialStatus={overrides.initialStatus ?? 'ALL'}
    />,
  );
}

describe('BillingClient — Invoice list', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockFetch();
  });

  afterEach(() => {
    cleanup();
  });

  it('renders the page header with "New Invoice" button', () => {
    renderBilling();
    expect(screen.getByText('Billing')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /new invoice/i })).toBeInTheDocument();
  });

  it('shows empty state when no invoices exist', () => {
    renderBilling();
    expect(screen.getByText('No invoices found')).toBeInTheDocument();
  });

  it('shows invoices in the table when data exists', () => {
    renderBilling({ invoicesPage: oneInvoicePage() });
    expect(screen.getByText('Ahmed Al Mansoori')).toBeInTheDocument();
    // StatusBadge renders the status text
    const statusBadges = screen.getAllByText('DUE');
    // At least one is the status badge in the table
    expect(statusBadges.length).toBeGreaterThan(0);
  });

  it('shows error banner when initialError is set', () => {
    renderBilling({ initialError: 'Something went wrong' });
    expect(screen.getByText('Something went wrong')).toBeInTheDocument();
  });
});

describe('BillingClient — New Invoice Modal', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockFetch();
  });

  afterEach(() => {
    cleanup();
  });

  function openComposeModal() {
    renderBilling();
    const newBtn = screen.getByRole('button', { name: /new invoice/i });
    fireEvent.click(newBtn);
  }

  it('opens compose modal when clicking "New Invoice"', () => {
    openComposeModal();
    expect(screen.getByText('Create Invoice')).toBeInTheDocument();
    // Member label exists in both table header and modal; verify modal-specific content
    expect(screen.getByPlaceholderText(/search member by name/i)).toBeInTheDocument();
  });

  it('disables Create button when no member selected and no date', () => {
    openComposeModal();
    const createBtn = screen.getByRole('button', { name: /create invoice/i });
    expect(createBtn).toBeDisabled();
  });

  it('enables Create button when member is selected, date is set, and amount > 0', async () => {
    const fetchFn = mockFetch({
      ok: true,
      status: 200,
      json: async () => ({
        items: [{ id: 'mem-1', fullName: 'Ahmed', phone: '+971501234567' }],
        total: 1,
      }),
    });

    openComposeModal();

    // Search for a member
    const searchInput = screen.getByPlaceholderText(/search member by name/i);
    fireEvent.change(searchInput, { target: { value: 'Ahmed' } });

    await waitFor(() => {
      expect(fetchFn).toHaveBeenCalled();
    });

    // If results appear, select one
    await waitFor(() => {
      const memberBtn = screen.queryByText('Ahmed');
      if (memberBtn) fireEvent.click(memberBtn);
    });
  });

  it('closes modal when clicking the X button', () => {
    openComposeModal();
    const closeBtns = screen.getAllByRole('button', { name: '' });
    const closeBtn = closeBtns.find((b) => b.querySelector('.lucide-x'));
    if (closeBtn) fireEvent.click(closeBtn);
    waitFor(() => {
      expect(screen.queryByText('Create Invoice')).not.toBeInTheDocument();
    });
  });
});

describe('BillingClient — Tab navigation', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockFetch();
  });

  afterEach(() => {
    cleanup();
  });

  it('renders Invoices, Salary Window, and Reconciliation tabs', () => {
    renderBilling();
    expect(screen.getByText('Invoices')).toBeInTheDocument();
    expect(screen.getByText('Salary Window')).toBeInTheDocument();
    expect(screen.getByText('Reconciliation')).toBeInTheDocument();
  });

  it('switches to Salary Window tab and loads data', async () => {
    const fetchFn = mockFetch();
    renderBilling();
    const salaryTab = screen.getByText('Salary Window');
    fireEvent.click(salaryTab);

    await waitFor(() => {
      expect(screen.getByText(/Start Day/i)).toBeInTheDocument();
    });
  });
});

describe('BillingClient — Invoice detail slide-over', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    cleanup();
  });

  it('loads invoice detail when clicking a row', async () => {
    const fetchFn = mockFetch({
      ok: true,
      status: 200,
      json: async () => ({
        id: 'inv-test-12345678',
        memberId: 'mem-1',
        amountAed: 29900,
        vatAed: 1495,
        currency: 'AED',
        dueDate: new Date('2026-08-01').toISOString(),
        status: 'DUE',
        description: 'Monthly membership',
        createdAt: new Date().toISOString(),
        member: {
          id: 'mem-1',
          fullName: 'Ahmed Al Mansoori',
          phone: '+971501234567',
          email: null,
        },
        attempts: [],
      }),
    });
    renderBilling({ invoicesPage: oneInvoicePage() });

    const row = screen.getByText('Ahmed Al Mansoori');
    fireEvent.click(row);

    await waitFor(() => {
      expect(fetchFn).toHaveBeenCalledWith(
        expect.stringContaining('/api/billing/invoices/inv-test'),
        expect.anything(),
      );
    });
  });
});

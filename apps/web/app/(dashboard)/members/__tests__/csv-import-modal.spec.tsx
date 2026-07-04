/**
 * CsvImportModal — Workflow Tests
 *
 * Covers: upload step, paste CSV, preview step, apply step, done step, error handling.
 */
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { CsvImportModal } from '../csv-import-modal';

const mockRouter = { refresh: vi.fn(), push: vi.fn() };
vi.mock('next/navigation', () => ({ useRouter: () => mockRouter }));

const VALID_CSV = 'fullName,phone,email\nAhmed,+971501234567,ahmed@test.com\nFatima,+971509876543,fatima@test.com';

describe('CsvImportModal', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn(async (url: string) => {
      if (typeof url === 'string' && url.includes('/preview')) {
        return {
          ok: true,
          json: async () => ({ totalRows: 2, validRows: 2, errors: [], toCreate: [{ fullName: 'Ahmed', phone: '+971501234567' }, { fullName: 'Fatima', phone: '+971509876543' }], toUpdate: [], unchanged: 0 }),
        } as Response;
      }
      if (typeof url === 'string' && url.includes('/apply')) {
        return {
          ok: true,
          json: async () => ({ applied: true, totalRows: 2, validRows: 2, errors: [], toCreate: [], toUpdate: [], unchanged: 0, created: 2, updated: 0 }),
        } as Response;
      }
      return { ok: true, json: async () => ({}) } as Response;
    }));
  });
  afterEach(() => { cleanup(); vi.unstubAllGlobals(); vi.clearAllMocks(); });

  describe('upload step', () => {
    it('renders the upload step by default', () => {
      render(<CsvImportModal onClose={vi.fn()} />);
      expect(screen.getByText('Import Members from CSV')).toBeInTheDocument();
      expect(screen.getByText(/Click to select a/)).toBeInTheDocument();
      expect(screen.getByText('Preview Import')).toBeInTheDocument();
    });

    it('shows template CSV as placeholder', () => {
      render(<CsvImportModal onClose={vi.fn()} />);
      const textarea = screen.getByPlaceholderText(/externalId,fullName/);
      expect(textarea).toBeInTheDocument();
    });

    it('shows required/optional column guide', () => {
      render(<CsvImportModal onClose={vi.fn()} />);
      expect(screen.getByText('Required columns')).toBeInTheDocument();
      expect(screen.getByText('Optional columns')).toBeInTheDocument();
    });

    it('disables Preview button when CSV is empty', () => {
      render(<CsvImportModal onClose={vi.fn()} />);
      expect(screen.getByText('Preview Import')).toBeDisabled();
    });

    it('enables Preview button when CSV text is pasted', async () => {
      render(<CsvImportModal onClose={vi.fn()} />);
      const textarea = screen.getByPlaceholderText(/externalId,fullName/);
      fireEvent.change(textarea, { target: { value: VALID_CSV } });
      expect(screen.getByText('Preview Import')).not.toBeDisabled();
    });

    it('calls onClose when Cancel clicked', async () => {
      const onClose = vi.fn();
      render(<CsvImportModal onClose={onClose} />);
      await userEvent.click(screen.getByText('Cancel'));
      expect(onClose).toHaveBeenCalled();
    });
  });

  describe('preview step', () => {
    it('transitions to preview step after submitting CSV', async () => {
      render(<CsvImportModal onClose={vi.fn()} />);
      const textarea = screen.getByPlaceholderText(/externalId,fullName/);
      fireEvent.change(textarea, { target: { value: VALID_CSV } });
      await userEvent.click(screen.getByText('Preview Import'));

      await waitFor(() => {
        expect(screen.getByText('To create')).toBeInTheDocument();
        expect(screen.getByText('2')).toBeInTheDocument(); // 2 to create
      });
    });

    it('shows Back button to return to upload', async () => {
      render(<CsvImportModal onClose={vi.fn()} />);
      const textarea = screen.getByPlaceholderText(/externalId,fullName/);
      fireEvent.change(textarea, { target: { value: VALID_CSV } });
      await userEvent.click(screen.getByText('Preview Import'));

      await waitFor(() => expect(screen.getByText('Back')).toBeInTheDocument());
      await userEvent.click(screen.getByText('Back'));
      expect(screen.getByText('Preview Import')).toBeInTheDocument();
    });
  });

  describe('apply step', () => {
    it('transitions to done step after applying', async () => {
      render(<CsvImportModal onClose={vi.fn()} />);
      const textarea = screen.getByPlaceholderText(/externalId,fullName/);
      fireEvent.change(textarea, { target: { value: VALID_CSV } });
      await userEvent.click(screen.getByText('Preview Import'));

      await waitFor(() => expect(screen.getByText('Apply Import')).toBeInTheDocument());
      await userEvent.click(screen.getByText('Apply Import'));

      await waitFor(() => {
        expect(screen.getByText('Import successful')).toBeInTheDocument();
        expect(screen.getByText(/2 members created/)).toBeInTheDocument();
      });
    });

    it('closes modal when Done clicked', async () => {
      const onClose = vi.fn();
      render(<CsvImportModal onClose={onClose} />);
      const textarea = screen.getByPlaceholderText(/externalId,fullName/);
      fireEvent.change(textarea, { target: { value: VALID_CSV } });
      await userEvent.click(screen.getByText('Preview Import'));
      await waitFor(() => expect(screen.getByText('Apply Import')).toBeInTheDocument());
      await userEvent.click(screen.getByText('Apply Import'));

      await waitFor(() => expect(screen.getByText('Done')).toBeInTheDocument());
      await userEvent.click(screen.getByText('Done'));
      expect(onClose).toHaveBeenCalled();
    });
  });

  describe('error handling', () => {
    it('shows error when preview fails', async () => {
      vi.stubGlobal('fetch', vi.fn(async (url: string) => {
        if (typeof url === 'string' && url.includes('/preview')) {
          return { ok: false, status: 500, json: async () => ({ message: 'Server error' }) } as Response;
        }
        return { ok: true, json: async () => ({}) } as Response;
      }));

      render(<CsvImportModal onClose={vi.fn()} />);
      const textarea = screen.getByPlaceholderText(/externalId,fullName/);
      fireEvent.change(textarea, { target: { value: VALID_CSV } });
      await userEvent.click(screen.getByText('Preview Import'));

      await waitFor(() => {
        expect(screen.getByText(/Network error/)).toBeInTheDocument();
      });
    });
  });
});

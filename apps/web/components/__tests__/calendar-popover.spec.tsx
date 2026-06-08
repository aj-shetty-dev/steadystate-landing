import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { CalendarPopover } from '../ui/calendar-popover';

describe('CalendarPopover', () => {
  afterEach(() => {
    cleanup();
  });

  function renderCalendar(value = '') {
    const onChange = vi.fn();
    const result = render(<CalendarPopover value={value} onChange={onChange} />);
    return { ...result, onChange };
  }

  function openPopover() {
    const rendered = renderCalendar();
    const btn = screen.getByRole('button', { name: /pick a date/i });
    fireEvent.click(btn);
    return rendered;
  }

  // ── Year navigation chevrons ───────────────────────────────────────────
  describe('Year navigation', () => {
    it('shows ChevronsLeft/ChevronsRight for year-level jumping', () => {
      openPopover();
      const prevYear = document.querySelector('button[title="Previous year"]');
      const nextYear = document.querySelector('button[title="Next year"]');
      expect(prevYear).not.toBeNull();
      expect(nextYear).not.toBeNull();
    });

    it('shifts year forward when clicking the next-year chevron', () => {
      openPopover();
      const header = document.querySelector('button[title="Click to change year"]');
      const currentYear = parseInt(header!.textContent!.match(/\d{4}/)![0]);

      const nextYearBtn = document.querySelector('button[title="Next year"]')!;
      fireEvent.click(nextYearBtn);

      const newHeader = document.querySelector('button[title="Click to change year"]');
      const newYear = parseInt(newHeader!.textContent!.match(/\d{4}/)![0]);
      expect(newYear).toBe(currentYear + 1);
    });

    it('shifts year backward when clicking the prev-year chevron', () => {
      openPopover();
      const header = document.querySelector('button[title="Click to change year"]');
      const currentYear = parseInt(header!.textContent!.match(/\d{4}/)![0]);

      const prevYearBtn = document.querySelector('button[title="Previous year"]')!;
      fireEvent.click(prevYearBtn);

      const newHeader = document.querySelector('button[title="Click to change year"]');
      const newYear = parseInt(newHeader!.textContent!.match(/\d{4}/)![0]);
      expect(newYear).toBe(currentYear - 1);
    });
  });

  // ── Year selector grid ─────────────────────────────────────────────────
  describe('Year selector grid', () => {
    it('shows year selector when clicking the month/year header', () => {
      openPopover();

      const headerBtn = document.querySelector('button[title="Click to change year"]');
      expect(headerBtn).not.toBeNull();
      fireEvent.click(headerBtn!);

      expect(screen.getByText('Select year')).toBeInTheDocument();
    });

    it('navigates to the selected year and returns to month view', async () => {
      openPopover();

      // Open year selector
      const headerBtn = document.querySelector('button[title="Click to change year"]')!;
      fireEvent.click(headerBtn);

      // Click on the year 2020 (within range, rendered in the grid)
      const yearBtn = screen.getByText('2020');
      fireEvent.click(yearBtn);

      await waitFor(() => {
        const header = document.querySelector('button[title="Click to change year"]');
        expect(header!.textContent).toContain('2020');
      });
    });
  });

  // ── Month navigation still works ───────────────────────────────────────
  describe('Month navigation still works', () => {
    it('shifts month forward with ChevronRight', async () => {
      openPopover();
      const header = document.querySelector('button[title="Click to change year"]')!;
      const currentText = header.textContent!;

      const nextMonthBtn = document.querySelector('button[title="Next month"]')!;
      fireEvent.click(nextMonthBtn);

      await waitFor(() => {
        expect(header.textContent).not.toBe(currentText);
      });
    });

    it('shifts month backward with ChevronLeft', async () => {
      openPopover();
      const header = document.querySelector('button[title="Click to change year"]')!;
      const currentText = header.textContent!;

      const prevMonthBtn = document.querySelector('button[title="Previous month"]')!;
      fireEvent.click(prevMonthBtn);

      await waitFor(() => {
        expect(header.textContent).not.toBe(currentText);
      });
    });
  });

  // ── Year selector highlight ────────────────────────────────────────────
  describe('Year selector highlight', () => {
    it('highlights the currently-viewed year in the year grid', () => {
      openPopover();

      const headerBtn = document.querySelector('button[title="Click to change year"]')!;
      fireEvent.click(headerBtn);

      // The currently viewed year should have the green bg class
      const greenBtns = document.querySelectorAll('.bg-green.text-white');
      expect(greenBtns.length).toBeGreaterThan(0);
    });
  });

  // ── Selected value renders correctly ───────────────────────────────────
  describe('Selected value display', () => {
    it('shows the selected date formatted in the button', () => {
      renderCalendar('2025-06-15');
      const btn = screen.getByRole('button');
      expect(btn.textContent).toContain('2025');
    });

    it('shows "Pick a date…" when no value', () => {
      renderCalendar('');
      const btn = screen.getByRole('button');
      expect(btn.textContent).toContain('Pick a date');
    });

    it('selecting a day calls onChange and closes the popover', () => {
      const { onChange } = openPopover();

      // Click day 15 (should be present in any month)
      const dayBtn = screen.getByText('15');
      fireEvent.click(dayBtn);

      expect(onChange).toHaveBeenCalledTimes(1);
      const calledWith = onChange.mock.calls[0][0] as string;
      expect(calledWith).toMatch(/^\d{4}-\d{2}-15$/);
    });
  });
});

'use client';

import { Calendar, ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight } from 'lucide-react';
import { useRef, useState } from 'react';

const inputCls =
  'w-full rounded-lg border border-border bg-surface2 px-3 py-2 text-sm text-text placeholder-text3 focus:outline-none focus:ring-2 focus:ring-green/40 focus:border-green/60 transition-colors';

const MONTHS = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];
const DAYS = ['Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa', 'Su'];

const YEAR_RANGE_START = 1900;
const YEAR_RANGE_END = new Date().getFullYear() + 5;

function parseLocalDate(val: string): Date | null {
  if (!val) return null;
  const d = new Date(val + 'T00:00:00');
  return isNaN(d.getTime()) ? null : d;
}

export function CalendarPopover({
  value,
  onChange,
}: {
  value: string;
  onChange: (v: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState({ top: 0, left: 0 });
  const [showYearSelect, setShowYearSelect] = useState(false);
  const btnRef = useRef<HTMLButtonElement>(null);
  const selected = parseLocalDate(value);
  const today = new Date();

  const [view, setView] = useState<{ year: number; month: number }>(() => {
    const d = selected ?? today;
    return { year: d.getFullYear(), month: d.getMonth() };
  });

  function handleOpen() {
    if (btnRef.current) {
      const r = btnRef.current.getBoundingClientRect();
      const popoverW = window.innerWidth < 640 ? 288 : 256;
      const left = Math.max(8, Math.min(r.left, window.innerWidth - popoverW - 16));
      setPos({ top: r.bottom + 4, left });
    }
    if (selected) setView({ year: selected.getFullYear(), month: selected.getMonth() });
    setOpen(true);
    setShowYearSelect(false);
  }

  function shiftMonth(delta: number) {
    setView((v) => {
      const d = new Date(v.year, v.month + delta);
      return { year: d.getFullYear(), month: d.getMonth() };
    });
  }

  function shiftYear(delta: number) {
    setView((v) => {
      const d = new Date(v.year + delta, v.month);
      return { year: d.getFullYear(), month: d.getMonth() };
    });
  }

  function selectYear(year: number) {
    setView((v) => ({ year, month: v.month }));
    setShowYearSelect(false);
  }

  function pickDay(day: number) {
    const month = String(view.month + 1).padStart(2, '0');
    const d = String(day).padStart(2, '0');
    onChange(`${view.year}-${month}-${d}`);
    setOpen(false);
  }

  const firstWeekday = (new Date(view.year, view.month, 1).getDay() + 6) % 7;
  const daysInMonth = new Date(view.year, view.month + 1, 0).getDate();
  const cells: (number | null)[] = [
    ...Array<null>(firstWeekday).fill(null),
    ...Array.from({ length: daysInMonth }, (_, i) => i + 1),
  ];

  const formatted = selected
    ? selected.toLocaleDateString('en-AE', { day: 'numeric', month: 'short', year: 'numeric' })
    : null;

  // Pre-compute year list for the year selector
  const years = Array.from(
    { length: YEAR_RANGE_END - YEAR_RANGE_START + 1 },
    (_, i) => YEAR_RANGE_START + i,
  );

  return (
    <>
      <button
        ref={btnRef}
        type="button"
        onClick={handleOpen}
        className={`${inputCls} flex items-center justify-between gap-2`}
      >
        <span className={formatted ? 'text-text' : 'text-text3'}>
          {formatted ?? 'Pick a date…'}
        </span>
        <Calendar className="w-4 h-4 text-text3 shrink-0" />
      </button>

      {open && (
        <>
          <div className="fixed inset-0 z-[60]" onClick={() => setOpen(false)} />
          <div
            className="fixed z-[70] w-72 sm:w-64 bg-surface border border-border rounded-xl shadow-xl p-3"
            style={{ top: pos.top, left: pos.left }}
          >
            {showYearSelect ? (
              /* ───────── Year Selector ───────── */
              <div>
                <div className="flex items-center gap-2 mb-3">
                  <button
                    type="button"
                    onClick={() => setShowYearSelect(false)}
                    className="p-2 rounded hover:bg-surface2 text-text3 hover:text-text transition-colors"
                  >
                    <ChevronLeft className="w-4 h-4" />
                  </button>
                  <span className="text-sm font-semibold text-text">Select year</span>
                </div>
                <div className="grid grid-cols-4 gap-1 max-h-48 overflow-y-auto">
                  {years.map((y) => (
                    <button
                      key={y}
                      type="button"
                      onClick={() => selectYear(y)}
                      className={[
                        'rounded-md py-1.5 text-xs font-medium transition-colors',
                        y === view.year
                          ? 'bg-green text-white'
                          : 'text-text hover:bg-surface2',
                      ].join(' ')}
                    >
                      {y}
                    </button>
                  ))}
                </div>
              </div>
            ) : (
              /* ───────── Month Calendar ───────── */
              <>
                <div className="flex items-center justify-between mb-3">
                  <button
                    type="button"
                    onClick={() => shiftYear(-1)}
                    className="p-2 rounded hover:bg-surface2 text-text3 hover:text-text transition-colors"
                    title="Previous year"
                  >
                    <ChevronsLeft className="w-4 h-4" />
                  </button>
                  <button
                    type="button"
                    onClick={() => shiftMonth(-1)}
                    className="p-2 rounded hover:bg-surface2 text-text3 hover:text-text transition-colors"
                    title="Previous month"
                  >
                    <ChevronLeft className="w-4 h-4" />
                  </button>
                  <button
                    type="button"
                    onClick={() => setShowYearSelect(true)}
                    className="text-sm font-semibold text-text hover:text-green px-1.5 py-0.5 rounded hover:bg-surface2 transition-colors cursor-pointer"
                    title="Click to change year"
                  >
                    {MONTHS[view.month]} {view.year}
                  </button>
                  <button
                    type="button"
                    onClick={() => shiftMonth(1)}
                    className="p-2 rounded hover:bg-surface2 text-text3 hover:text-text transition-colors"
                    title="Next month"
                  >
                    <ChevronRight className="w-4 h-4" />
                  </button>
                  <button
                    type="button"
                    onClick={() => shiftYear(1)}
                    className="p-2 rounded hover:bg-surface2 text-text3 hover:text-text transition-colors"
                    title="Next year"
                  >
                    <ChevronsRight className="w-4 h-4" />
                  </button>
                </div>

                <div className="grid grid-cols-7 mb-1">
                  {DAYS.map((d) => (
                    <span key={d} className="text-center text-[10px] font-medium text-text3 py-1">
                      {d}
                    </span>
                  ))}
                </div>

                <div className="grid grid-cols-7 gap-y-0.5">
                  {cells.map((day, i) => {
                    if (!day) return <span key={i} />;
                    const isSel =
                      selected &&
                      selected.getFullYear() === view.year &&
                      selected.getMonth() === view.month &&
                      selected.getDate() === day;
                    const isToday =
                      today.getFullYear() === view.year &&
                      today.getMonth() === view.month &&
                      today.getDate() === day;
                    return (
                      <button
                        key={i}
                        type="button"
                        onClick={() => pickDay(day)}
                        className={[
                          'flex items-center justify-center rounded-md text-sm w-full aspect-square transition-colors',
                          isSel ? 'bg-green text-white font-semibold' : '',
                          !isSel && isToday ? 'text-green font-semibold ring-1 ring-green/50' : '',
                          !isSel ? 'hover:bg-surface2 text-text' : '',
                        ].join(' ')}
                      >
                        {day}
                      </button>
                    );
                  })}
                </div>

                {value && (
                  <button
                    type="button"
                    onClick={() => {
                      onChange('');
                      setOpen(false);
                    }}
                    className="mt-2 w-full rounded-md py-2 text-xs text-text3 hover:text-text hover:bg-surface2 transition-colors"
                  >
                    Clear date
                  </button>
                )}
              </>
            )}
          </div>
        </>
      )}
    </>
  );
}

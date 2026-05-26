'use client';

import { Calendar, ChevronLeft, ChevronRight } from 'lucide-react';
import { useRef, useState } from 'react';

const inputCls =
  'w-full rounded-lg border border-border bg-surface2 px-3 py-2 text-sm text-text placeholder-text3 focus:outline-none focus:ring-2 focus:ring-green/40 focus:border-green/60 transition-colors';

const MONTHS = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];
const DAYS = ['Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa', 'Su'];

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
      const left = Math.min(r.left, window.innerWidth - 272);
      setPos({ top: r.bottom + 4, left });
    }
    if (selected) setView({ year: selected.getFullYear(), month: selected.getMonth() });
    setOpen(true);
  }

  function shiftMonth(delta: number) {
    setView((v) => {
      const d = new Date(v.year, v.month + delta);
      return { year: d.getFullYear(), month: d.getMonth() };
    });
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
            className="fixed z-[70] w-64 bg-surface border border-border rounded-xl shadow-xl p-3"
            style={{ top: pos.top, left: pos.left }}
          >
            <div className="flex items-center justify-between mb-3">
              <button
                type="button"
                onClick={() => shiftMonth(-1)}
                className="p-1 rounded hover:bg-surface2 text-text3 hover:text-text transition-colors"
              >
                <ChevronLeft className="w-4 h-4" />
              </button>
              <span className="text-sm font-semibold text-text">
                {MONTHS[view.month]} {view.year}
              </span>
              <button
                type="button"
                onClick={() => shiftMonth(1)}
                className="p-1 rounded hover:bg-surface2 text-text3 hover:text-text transition-colors"
              >
                <ChevronRight className="w-4 h-4" />
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
                className="mt-2 w-full rounded-md py-1 text-xs text-text3 hover:text-text hover:bg-surface2 transition-colors"
              >
                Clear date
              </button>
            )}
          </div>
        </>
      )}
    </>
  );
}

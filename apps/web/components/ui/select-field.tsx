'use client';

import { Check, ChevronDown } from 'lucide-react';
import { useRef, useState } from 'react';

const inputCls =
  'w-full rounded-lg border border-border bg-surface2 px-3 py-2 text-sm text-text placeholder-text3 focus:outline-none focus:ring-2 focus:ring-green/40 focus:border-green/60 transition-colors';

export function SelectField({
  value,
  onChange,
  options,
}: {
  value: string;
  onChange: (v: string) => void;
  options: { value: string; label: string }[];
}) {
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState({ top: 0, left: 0, width: 0 });
  const btnRef = useRef<HTMLButtonElement>(null);

  const selected = options.find((o) => o.value === value);

  function handleOpen() {
    if (btnRef.current) {
      const r = btnRef.current.getBoundingClientRect();
      setPos({ top: r.bottom + 4, left: r.left, width: r.width });
    }
    setOpen(true);
  }

  return (
    <>
      <button
        ref={btnRef}
        type="button"
        onClick={handleOpen}
        className={`${inputCls} flex items-center justify-between gap-2`}
      >
        <span className={selected?.value !== undefined ? 'text-text' : 'text-text3'}>
          {selected?.label ?? 'Select…'}
        </span>
        <ChevronDown
          className={`w-4 h-4 text-text3 shrink-0 transition-transform ${open ? 'rotate-180' : ''}`}
        />
      </button>

      {open && (
        <>
          <div className="fixed inset-0 z-[60]" onClick={() => setOpen(false)} />
          <div
            className="fixed z-[70] bg-surface border border-border rounded-lg shadow-xl py-1 overflow-auto max-h-56"
            style={{ top: pos.top, left: pos.left, width: pos.width }}
          >
            {options.map((o) => (
              <button
                key={o.value}
                type="button"
                onClick={() => {
                  onChange(o.value);
                  setOpen(false);
                }}
                className="flex w-full items-center justify-between px-3 py-2 text-sm hover:bg-surface2 transition-colors"
              >
                <span className={o.value === value ? 'text-green font-medium' : 'text-text'}>
                  {o.label}
                </span>
                {o.value === value && <Check className="w-3.5 h-3.5 text-green shrink-0" />}
              </button>
            ))}
          </div>
        </>
      )}
    </>
  );
}

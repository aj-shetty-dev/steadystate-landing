'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';

export function BillingActions() {
  const router = useRouter();
  const [busy, setBusy] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);

  async function run(action: 'schedule' | 'process') {
    setBusy(action);
    setMsg(null);
    try {
      const res = await fetch(`/api/proxy/billing/${action}`, { method: 'POST' });
      const data = (await res.json()) as Record<string, number | string>;
      if (!res.ok) throw new Error((data as { message?: string }).message ?? 'failed');
      setMsg(`${action}: ${JSON.stringify(data)}`);
      router.refresh();
    } catch (e) {
      setMsg(`${action} failed: ${(e as Error).message}`);
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="flex flex-col items-end gap-2">
      <div className="flex gap-2">
        <button
          onClick={() => run('schedule')}
          disabled={busy !== null}
          className="px-4 py-2 text-sm font-medium bg-green text-bg rounded-md hover:opacity-90 disabled:opacity-40 transition-opacity"
        >
          {busy === 'schedule' ? 'Scheduling…' : 'Schedule retries'}
        </button>
        <button
          onClick={() => run('process')}
          disabled={busy !== null}
          className="px-4 py-2 text-sm font-medium border border-border rounded-md text-text hover:bg-surface2 disabled:opacity-40 transition-colors"
        >
          {busy === 'process' ? 'Processing…' : 'Process due'}
        </button>
      </div>
      {msg ? <div className="text-text3 text-xs">{msg}</div> : null}
    </div>
  );
}

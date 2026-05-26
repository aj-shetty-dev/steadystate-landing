'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';

interface Result {
  detection: { membersScanned: number; signalsCreated: number; signalsSkipped: number };
  dispatch: { pending: number; sent: number; skipped: number; failed: number; suppressed: boolean };
}

export function RunChurnButton() {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<Result | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function go() {
    setError(null);
    setResult(null);
    setLoading(true);
    try {
      const res = await fetch('/api/proxy/automation/run', { method: 'POST' });
      if (!res.ok) {
        const body = (await res.json().catch(() => ({}))) as { message?: string };
        setError(body.message ?? 'Run failed');
        return;
      }
      setResult((await res.json()) as Result);
      router.refresh();
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="bg-surface border border-border rounded-lg p-5 space-y-3">
      <div className="flex items-center justify-between">
        <div>
          <div className="text-base font-semibold tracking-tight text-text">Churn engine</div>
          <div className="text-xs text-text2 mt-1">
            Detect 5-day idle members, dispatch WhatsApp nudges (mocked in dev).
          </div>
        </div>
        <button
          onClick={go}
          disabled={loading}
          className="bg-green text-black text-sm font-semibold px-4 py-2 rounded-md hover:opacity-90 disabled:opacity-50 transition-opacity"
        >
          {loading ? 'Running…' : 'Run now'}
        </button>
      </div>
      {error && <p className="text-sm text-error">{error}</p>}
      {result && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-sm pt-2">
          <Stat label="Scanned" value={result.detection.membersScanned} />
          <Stat label="New signals" value={result.detection.signalsCreated} />
          <Stat label="Sent" value={result.dispatch.sent} />
          <Stat label="Failed" value={result.dispatch.failed} />
        </div>
      )}
    </div>
  );
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div className="bg-bg border border-border rounded-md px-3 py-2">
      <div className="text-[11px] font-medium uppercase tracking-wider text-text3">{label}</div>
      <div className="text-lg font-semibold tabular-nums text-text mt-1">{value}</div>
    </div>
  );
}

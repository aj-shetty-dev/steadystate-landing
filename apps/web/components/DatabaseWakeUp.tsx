'use client';

import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { RefreshCw } from 'lucide-react';

const messages: { atSecond: number; text: string }[] = [
  { atSecond: 0, text: 'Welcome back!' },
  { atSecond: 4, text: 'Connecting to your database…' },
  { atSecond: 8, text: 'Retrieving your details…' },
  { atSecond: 13, text: 'Almost there…' },
  { atSecond: 20, text: 'Still working on it — hang tight.' },
  { atSecond: 30, text: 'Taking a little longer than expected.' },
];

const POLL_INTERVAL = 3000;
const TIMEOUT_SECONDS = 45;

export default function DatabaseWakeUp() {
  const router = useRouter();
  const [elapsed, setElapsed] = useState(0);
  const [status, setStatus] = useState<'connecting' | 'timeout'>('connecting');
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    // Tick every second to update the message
    intervalRef.current = setInterval(() => {
      setElapsed((prev) => {
        if (prev >= TIMEOUT_SECONDS) {
          return prev;
        }
        return prev + 1;
      });
    }, 1000);

    // Poll health endpoint every 3s
    const poll = async () => {
      try {
        const res = await fetch('/api/health');
        if (res.ok) {
          const data = await res.json();
          if (data.ok) {
            router.refresh();
          }
        }
      } catch {
        // Server still starting up — keep polling
      }
    };

    poll(); // immediately on mount
    pollRef.current = setInterval(poll, POLL_INTERVAL);

    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
      if (pollRef.current) clearInterval(pollRef.current);
    };
  }, [router]);

  useEffect(() => {
    if (elapsed >= TIMEOUT_SECONDS) {
      setStatus('timeout');
      if (intervalRef.current) clearInterval(intervalRef.current);
      if (pollRef.current) clearInterval(pollRef.current);
    }
  }, [elapsed]);

  const currentMessage =
    [...messages].reverse().find((m) => elapsed >= m.atSecond)?.text ?? messages[0].text;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-bg">
      <div className="flex flex-col items-center gap-6 px-6 text-center">
        {/* Animated spinner */}
        <div className="relative h-16 w-16">
          <div className="absolute inset-0 animate-spin rounded-full border-4 border-border border-t-brand" />
          <div className="absolute inset-2 animate-spin rounded-full border-4 border-border border-b-brand [animation-delay:500ms]" />
        </div>

        {/* Message */}
        <div className="space-y-2">
          <h2 className="text-xl font-semibold text-text">{currentMessage}</h2>
          {status === 'timeout' ? (
            <div className="space-y-4">
              <p className="text-sm text-text2">
                This is taking longer than expected. You can wait or try again.
              </p>
              <button
                onClick={() => {
                  setElapsed(0);
                  setStatus('connecting');
                  router.refresh();
                }}
                className="inline-flex items-center gap-2 rounded-lg bg-brand px-4 py-2 text-sm font-medium text-black transition hover:bg-brand/90"
              >
                <RefreshCw className="h-4 w-4" />
                Retry
              </button>
            </div>
          ) : (
            <p className="text-sm text-text2">
              Setting things up for you{elapsed > 15 ? ' — thanks for your patience' : '…'}
            </p>
          )}
        </div>
      </div>
    </div>
  );
}

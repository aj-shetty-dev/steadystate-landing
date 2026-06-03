'use client';

import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';

const messages: { atSecond: number; text: string }[] = [
  { atSecond: 0, text: 'Welcome back!' },
  { atSecond: 4, text: 'Connecting to your database…' },
  { atSecond: 8, text: 'Retrieving your details…' },
  { atSecond: 13, text: 'Almost there…' },
  { atSecond: 20, text: 'Still working on it — hang tight.' },
  { atSecond: 30, text: 'Taking a little longer than expected.' },
  { atSecond: 45, text: 'The database is warming up from sleep. Won\'t be long.' },
  { atSecond: 75, text: 'Free-tier cold starts can take a minute. Thanks for your patience.' },
];

const POLL_INTERVAL = 3000;
const SLOW_POLL_INTERVAL = 8000;

export default function DatabaseWakeUp() {
  const router = useRouter();
  const [elapsed, setElapsed] = useState(0);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    // Tick every second to update the message
    intervalRef.current = setInterval(() => {
      setElapsed((prev) => prev + 1);
    }, 1000);

    // Poll health endpoint — fast at first, then slow down
    let pollCount = 0;
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
      pollCount++;
      // After 15 attempts (~45s), slow down polling
      if (pollCount >= 15 && pollRef.current) {
        clearInterval(pollRef.current);
        pollRef.current = setInterval(poll, SLOW_POLL_INTERVAL);
      }
    };

    poll(); // immediately on mount
    pollRef.current = setInterval(poll, POLL_INTERVAL);

    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
      if (pollRef.current) clearInterval(pollRef.current);
    };
  }, [router]);

  const currentMessage =
    [...messages].reverse().find((m) => elapsed >= m.atSecond)?.text ?? messages[0].text;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-bg">
      <div className="flex flex-col items-center gap-6 px-6 text-center max-w-md">
        {/* Animated spinner */}
        <div className="relative h-16 w-16">
          <div className="absolute inset-0 animate-spin rounded-full border-4 border-border border-t-brand" />
          <div className="absolute inset-2 animate-spin rounded-full border-4 border-border border-b-brand" style={{ animationDirection: 'reverse', animationDuration: '0.8s' }} />
        </div>

        {/* Message */}
        <div className="space-y-2">
          <h2 className="text-xl font-semibold text-text">{currentMessage}</h2>
          <p className="text-sm text-text2">
            {elapsed < 30
              ? 'Setting things up for you…'
              : 'Free-tier databases sleep when idle and take a moment to wake up.'}
          </p>
        </div>
      </div>
    </div>
  );
}

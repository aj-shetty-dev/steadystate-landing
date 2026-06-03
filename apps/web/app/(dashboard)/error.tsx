'use client';

import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';

interface Props {
  error: Error & { digest?: string };
  reset: () => void;
}

const MAX_AUTO_RETRIES = 10;
const RETRY_DELAYS = [2000, 3000, 5000, 8000, 10000, 15000, 15000, 20000, 20000, 30000]; // increasing backoff

function isConnectionError(error: Error): boolean {
  const msg = error.message.toLowerCase();
  return (
    msg.includes('unable to connect') ||
    msg.includes('connection') ||
    msg.includes('timeout') ||
    msg.includes('network') ||
    msg.includes('fetch failed') ||
    msg.includes('econnrefused') ||
    msg.includes('server is not running') ||
    (error as any).status === 0 ||
    (error as any).status >= 500
  );
}

export default function DashboardError({ error, reset }: Props) {
  const [retryCount, setRetryCount] = useState(0);
  const [countdown, setCountdown] = useState(0);
  const retryingRef = useRef(false);
  const isConnectionErr = isConnectionError(error);

  useEffect(() => {
    if (!isConnectionErr || retryCount >= MAX_AUTO_RETRIES) return;
    if (retryingRef.current) return;
    retryingRef.current = true;

    const delay = RETRY_DELAYS[retryCount] ?? 30000;
    setCountdown(Math.ceil(delay / 1000));

    // Countdown ticker
    const tickInterval = setInterval(() => {
      setCountdown((prev) => Math.max(0, prev - 1));
    }, 1000);

    const timer = setTimeout(() => {
      clearInterval(tickInterval);
      retryingRef.current = false;
      setRetryCount((prev) => prev + 1);
      reset();
    }, delay);

    return () => {
      clearTimeout(timer);
      clearInterval(tickInterval);
    };
  }, [retryCount, isConnectionErr, reset]);

  // Connection error → show reconnecting screen with auto-retry
  if (isConnectionErr && retryCount < MAX_AUTO_RETRIES) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] text-center px-4">
        <div className="relative h-12 w-12 mb-6">
          <div className="absolute inset-0 animate-spin rounded-full border-4 border-border border-t-green" />
          <div className="absolute inset-2 animate-spin rounded-full border-4 border-border border-b-green" style={{ animationDirection: 'reverse', animationDuration: '0.8s' }} />
        </div>
        <h2 className="text-xl font-semibold tracking-tight text-text mb-2">Reconnecting…</h2>
        <p className="text-sm text-text2 mb-1">
          The database is warming back up. This can take a minute on free-tier plans.
        </p>
        <p className="text-xs text-text3">
          Retrying automatically in {countdown}s{retryCount > 2 ? ` (attempt ${retryCount + 1}/${MAX_AUTO_RETRIES})` : ''}
        </p>
      </div>
    );
  }

  // Gave up after max retries, or non-connection error → show error with manual retry
  return (
    <div className="flex flex-col items-center justify-center min-h-[60vh] text-center px-4">
      <div className="w-12 h-12 rounded-full bg-error/10 flex items-center justify-center mb-4">
        <svg className="w-6 h-6 text-error" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v4m0 4h.01M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z" />
        </svg>
      </div>
      <h2 className="text-xl font-semibold tracking-tight text-text mb-2">Something went wrong</h2>
      <p className="text-sm text-text2 mb-1">
        {process.env.NODE_ENV === 'development' ? error.message : 'An unexpected error occurred.'}
      </p>
      {error.digest && (
        <p className="text-xs text-text3 font-mono mb-6">ref: {error.digest}</p>
      )}
      <div className="flex gap-3 mt-6">
        <button
          onClick={reset}
          className="px-4 py-2 text-sm font-medium bg-green text-bg rounded-md hover:opacity-90 transition-opacity"
        >
          Try again
        </button>
        <Link
          href="/overview"
          className="px-4 py-2 text-sm font-medium bg-surface2 border border-border text-text2 rounded-md hover:text-text transition-colors"
        >
          Overview
        </Link>
      </div>
    </div>
  );
}

'use client';

import Link from 'next/link';

interface Props {
  error: Error & { digest?: string };
  reset: () => void;
}

export default function DashboardError({ error, reset }: Props) {
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

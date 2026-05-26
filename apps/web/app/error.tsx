'use client';

interface Props {
  error: Error & { digest?: string };
  reset: () => void;
}

export default function RootError({ error, reset }: Props) {
  return (
    <div className="flex flex-col items-center justify-center min-h-screen text-center px-4 bg-bg">
      <h2 className="text-2xl font-semibold tracking-tight text-text mb-3">Something went wrong</h2>
      <p className="text-sm text-text2 mb-6">
        {process.env.NODE_ENV === 'development' ? error.message : 'An unexpected error occurred.'}
      </p>
      <button
        onClick={reset}
        className="px-4 py-2 text-sm font-medium bg-green text-bg rounded-md hover:opacity-90 transition-opacity"
      >
        Try again
      </button>
    </div>
  );
}

'use client';

import { useUser } from '@clerk/nextjs';
import { useRouter } from 'next/navigation';
import { useState, type FormEvent } from 'react';

export default function OnboardingPage() {
  const { user, isLoaded } = useUser();
  const router = useRouter();
  const [tenantName, setTenantName] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (!user) return;
    setError(null);
    setLoading(true);
    try {
      const res = await fetch('/api/auth/onboard', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tenantName }),
      });
      if (!res.ok) {
        const body = (await res.json().catch(() => ({}))) as { message?: string };
        setError(body.message ?? 'Onboarding failed');
        return;
      }
      // Refresh the Clerk session so the new tenantId metadata is in the JWT
      await user.reload();
      router.push('/overview');
      router.refresh();
    } catch {
      setError('Something went wrong. Please try again.');
    } finally {
      setLoading(false);
    }
  }

  if (!isLoaded) return null;

  return (
    <main className="min-h-screen flex items-center justify-center px-6">
      <form onSubmit={onSubmit} className="w-full max-w-sm space-y-5">
        <h1 className="text-3xl font-semibold tracking-tight text-text">Welcome</h1>
        <p className="text-text2 text-sm">
          Hi {user?.firstName ?? 'there'}! Tell us your gym name to finish setting up SteadyState.
        </p>

        <label className="block">
          <span className="text-xs font-medium text-text2">Gym / Business Name</span>
          <input
            type="text"
            value={tenantName}
            onChange={(e) => setTenantName(e.target.value)}
            required
            placeholder="e.g. FitLife Dubai"
            className="mt-1 w-full bg-surface border border-border rounded px-3 py-2 text-text focus:outline-none focus:border-green"
          />
        </label>

        {error && <p className="text-error text-sm">{error}</p>}

        <button
          type="submit"
          disabled={loading || !tenantName.trim()}
          className="w-full bg-green text-black font-semibold py-2 rounded hover:bg-green/90 disabled:opacity-50 transition"
        >
          {loading ? 'Setting up…' : 'Launch my dashboard'}
        </button>
      </form>
    </main>
  );
}

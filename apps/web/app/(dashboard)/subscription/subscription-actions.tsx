'use client';

import { useState } from 'react';

import { apiFetch } from '../../../lib/api';

interface SubscriptionActionsProps {
  hasStripeCustomer: boolean;
  plan: string;
  status: string;
}

export function SubscriptionActions({ hasStripeCustomer, plan, status }: SubscriptionActionsProps) {
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function handleCheckout(newPlan: string) {
    setBusy('checkout');
    setError(null);
    try {
      const data = await apiFetch<{ url?: string; message?: string }>('/subscriptions/checkout', {
        method: 'POST',
        body: JSON.stringify({
          plan: newPlan,
          successUrl: `${window.location.origin}/subscription?checkout=success`,
          cancelUrl: `${window.location.origin}/subscription`,
        }),
      });
                  if (data.url) window.location.href = data.url;
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(null);
    }
  }

  async function handlePortal() {
    setBusy('portal');
    setError(null);
    try {
      const data = await apiFetch<{ url?: string; message?: string }>('/subscriptions/portal', {
        method: 'POST',
        body: JSON.stringify({ returnUrl: `${window.location.origin}/subscription` }),
      });
                  if (data.url) window.location.href = data.url;
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(null);
    }
  }

  const isExpiredOrPastDue = status === 'EXPIRED' || status === 'PAST_DUE' || status === 'TRIALING';

  return (
    <div className="flex flex-col gap-3">
      {error && (
        <p className="text-sm text-red-500">{error}</p>
      )}
      <div className="flex gap-2 flex-wrap">
        {isExpiredOrPastDue && (
          <>
            {plan !== 'STARTER' && (
              <button
                disabled={busy !== null}
                onClick={() => handleCheckout('STARTER')}
                className="px-4 py-2 text-sm rounded-md bg-surface2 border border-border text-text hover:bg-surface3 disabled:opacity-50 transition-colors"
              >
                {busy === 'checkout' ? 'Redirecting…' : 'Starter — AED 499/mo'}
              </button>
            )}
            <button
              disabled={busy !== null}
              onClick={() => handleCheckout('GROWTH')}
              className="px-4 py-2 text-sm rounded-md bg-brand text-white hover:bg-brand/90 disabled:opacity-50 transition-colors"
            >
              {busy === 'checkout' ? 'Redirecting…' : 'Growth — AED 999/mo'}
            </button>
            <button
              disabled={busy !== null}
              onClick={() => handleCheckout('SCALE')}
              className="px-4 py-2 text-sm rounded-md bg-surface2 border border-border text-text hover:bg-surface3 disabled:opacity-50 transition-colors"
            >
              {busy === 'checkout' ? 'Redirecting\u2026' : 'Scale \u2014 AED 1,999/mo'}
            </button>
          </>
        )}
        {hasStripeCustomer && (
          <button
            disabled={busy !== null}
            onClick={handlePortal}
            className="px-4 py-2 text-sm rounded-md bg-surface2 border border-border text-text hover:bg-surface3 disabled:opacity-50 transition-colors"
          >
            {busy === 'portal' ? 'Redirecting…' : 'Manage billing →'}
          </button>
        )}
      </div>
    </div>
  );
}

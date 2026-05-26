import { Alert } from '../../../components/ui/alert';
import { Badge } from '../../../components/ui/badge';
import { PageHeader } from '../../../components/ui/page-header';
import { StatusBadge } from '../../../components/ui/status-badge';
import { apiFetch, type SubscriptionRow } from '../../../lib/api';
import { SubscriptionActions } from './subscription-actions';

export const dynamic = 'force-dynamic';

export default async function SubscriptionPage() {
  let data: { status: string; subscription: SubscriptionRow | null } | null = null;
  let err: string | null = null;
  try {
    data = await apiFetch<{ status: string; subscription: SubscriptionRow | null }>(
      '/subscriptions/current',
    );
  } catch (e) {
    err = (e as { message?: string }).message ?? 'failed to load';
  }

  const sub = data?.subscription;
  const trial = sub?.trialEndsAt ? new Date(sub.trialEndsAt) : null;
  const daysLeft = trial ? Math.max(0, Math.ceil((trial.getTime() - Date.now()) / 86_400_000)) : null;
  const periodEnd = sub?.currentPeriodEnd ? new Date(sub.currentPeriodEnd) : null;

  return (
    <div className="space-y-6">
      <PageHeader title="Subscription" description="Your SteadyState plan and billing status." />
      {err && <Alert>{err}</Alert>}
      {sub && (
        <>
          <div className="bg-surface border border-border rounded-lg p-6">
            <dl className="divide-y divide-border">
              <div className="flex justify-between items-center py-3">
                <dt className="text-text2 text-sm">Plan</dt>
                <dd className="text-text font-medium"><Badge tone="neutral">{sub.plan}</Badge></dd>
              </div>
              <div className="flex justify-between items-center py-3">
                <dt className="text-text2 text-sm">Status</dt>
                <dd>{data?.status && <StatusBadge status={data.status} />}</dd>
              </div>
              <div className="flex justify-between items-center py-3">
                <dt className="text-text2 text-sm">Provider</dt>
                <dd className="text-text font-medium">{sub.provider ?? 'mock'}</dd>
              </div>
              {trial && (
                <div className="flex justify-between items-center py-3">
                  <dt className="text-text2 text-sm">Trial ends</dt>
                  <dd className="text-text font-medium tabular-nums">
                    {trial.toLocaleDateString()} <span className="text-text3 font-normal">({daysLeft}d left)</span>
                  </dd>
                </div>
              )}
              {periodEnd && (
                <div className="flex justify-between items-center py-3">
                  <dt className="text-text2 text-sm">Current period ends</dt>
                  <dd className="text-text font-medium tabular-nums">{periodEnd.toLocaleDateString()}</dd>
                </div>
              )}
            </dl>
          </div>

          <SubscriptionActions
            hasStripeCustomer={!!sub.stripeCustomerId}
            plan={sub.plan}
            status={data?.status ?? sub.status}
          />
        </>
      )}
      {sub?.provider === 'mock' || !sub ? (
        <p className="text-xs text-text3 max-w-prose">
          Billing is in mock mode. Set <code className="font-mono">STRIPE_MODE=live</code> with real
          Stripe credentials to enable checkout and customer portal.
        </p>
      ) : null}
    </div>
  );
}

import { PageHeader } from '../../../components/ui/page-header';

export const dynamic = 'force-dynamic';

const SECTIONS = [
  {
    title: 'Getting started',
    body: `1. Sign up — a 14-day trial subscription is created automatically.
2. Add members via CSV import (Members → Import) or create them manually via the API.
3. Run the churn engine from Automation. Generated signals fan out to WhatsApp (mock in dev).`,
  },
  {
    title: 'Billing',
    body: `Salary-synced retries default to 25th–28th of each month (Asia/Dubai). A deterministic jitter spreads sends within a configurable window. Reminders render in EN or AR based on the member's preferredLocale.`,
  },
  {
    title: 'Door events',
    body: `POST /api/v1/door-events/webhook/:tenantId with an HMAC-SHA256 signature in X-Signature. Set DOOR_WEBHOOK_SECRET per-tenant in env. Signals generated: AFTER_HOURS_ENTRY (before 06:00 or from 23:00 Asia/Dubai) and TAILGATE_SUSPECTED (entry without a memberId).`,
  },
  {
    title: 'Shop',
    body: `Products carry a fils-denominated price and 5% VAT. Orders compute VAT per line, totals are inclusive. Mark orders paid via POST /shop/orders/:id/pay.`,
  },
  {
    title: 'Ramadan + locale',
    body: `Outbound WhatsApp is suppressed between Fajr (05:00) and Iftar (18:00) Asia/Dubai during the active Ramadan range. Locale is per-member (EN/AR).`,
  },
];

export default function DocsPage() {
  return (
    <div className="space-y-6 max-w-3xl">
      <PageHeader title="Docs" description="Getting started, integrations, and the moving parts of SteadyState." />
      {SECTIONS.map((s) => (
        <section key={s.title} className="bg-surface border border-border rounded-lg p-6">
          <h2 className="text-base font-semibold tracking-tight text-text">{s.title}</h2>
          <pre className="mt-3 whitespace-pre-wrap text-sm text-text2 font-sans leading-relaxed">{s.body}</pre>
        </section>
      ))}
    </div>
  );
}

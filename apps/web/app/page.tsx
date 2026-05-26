import Link from 'next/link';
import { redirect } from 'next/navigation';
import { getSessionUser } from '../lib/session';

export default async function HomePage() {
  const user = await getSessionUser();
  if (user) redirect('/overview');

  return (
    <main className="min-h-screen bg-bg text-text">
      <header className="flex items-center justify-between px-8 py-6 border-b border-border">
        <div className="text-xl font-semibold text-green">SteadyState</div>
        <nav className="flex gap-6 text-sm items-center">
          <Link href="/pricing" className="hover:text-green">Pricing</Link>
          <Link href="/login" className="hover:text-green">Login</Link>
          <Link
            href="/signup"
            className="rounded bg-green px-4 py-1.5 text-black font-medium hover:bg-green/90"
          >
            Start free trial
          </Link>
        </nav>
      </header>

      <section className="px-8 py-24 max-w-4xl mx-auto">
        <h1 className="text-5xl font-bold leading-tight">
          The intelligence layer for premium UAE gyms.
        </h1>
        <p className="mt-6 text-lg text-text2">
          SteadyState is an all-in-one gym platform built for UAE operators. Manage members,
          classes, and billing — then let automated WhatsApp nudges fire the moment a member
          starts to churn, a door event looks suspicious, or a salary-day retry can recover
          failed billing.
        </p>
        <div className="mt-8 flex gap-3">
          <Link
            href="/signup"
            className="rounded bg-green px-6 py-3 text-black font-medium hover:bg-green/90"
          >
            Start 14-day trial
          </Link>
          <Link
            href="/pricing"
            className="rounded border border-border px-6 py-3 hover:border-green"
          >
            See pricing
          </Link>
        </div>
      </section>

      <section className="px-8 py-16 max-w-5xl mx-auto grid gap-8 md:grid-cols-3">
        {[
          { title: 'Churn triggers', desc: 'WhatsApp nudge after 5 days of no check-in.' },
          { title: 'Salary-synced billing', desc: 'Retry failed payments on UAE salary dates.' },
          { title: 'Door intelligence', desc: 'After-hours + tailgate signals from access events.' },
        ].map((f) => (
          <div key={f.title} className="rounded border border-border bg-surface p-6">
            <div className="text-green font-semibold">{f.title}</div>
            <p className="mt-2 text-sm text-text2">{f.desc}</p>
          </div>
        ))}
      </section>

      <footer className="border-t border-border px-8 py-6 text-sm text-text3">
        © Nuviq · Dubai · me-south-1
      </footer>
    </main>
  );
}

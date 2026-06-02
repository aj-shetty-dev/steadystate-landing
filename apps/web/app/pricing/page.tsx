import Link from 'next/link';

const PLANS = [
  {
    name: 'Starter',
    price: 'AED 990 / mo',
    features: ['1 location', 'Up to 500 members', 'Churn + door automations', 'Email support'],
  },
  {
    name: 'Growth',
    price: 'AED 2,490 / mo',
    features: ['Up to 3 locations', '2,500 members', 'Salary-synced billing', 'Priority support'],
    highlight: true,
  },
  {
    name: 'Enterprise',
    price: 'Contact us',
    features: ['Unlimited locations', 'DIFC residency', 'Custom integrations', 'SLA + DPA'],
  },
];

export default function PricingPage() {
  return (
    <main className="min-h-screen bg-bg text-text">
      <header className="flex items-center justify-between px-4 sm:px-6 lg:px-8 py-4 sm:py-6 border-b border-border">
        <Link href="/" className="text-xl font-semibold text-green">SteadyState</Link>
        <nav className="flex gap-6 text-sm items-center">
          <Link href="/login" className="hover:text-green">Login</Link>
          <Link href="/signup" className="rounded bg-green px-4 py-1.5 text-black font-medium">
            Start free trial
          </Link>
        </nav>
      </header>
      <section className="px-4 sm:px-6 lg:px-8 py-12 sm:py-20 max-w-6xl mx-auto">
        <h1 className="text-3xl sm:text-4xl font-bold">Simple, UAE-priced.</h1>
        <p className="mt-4 text-text2">14-day free trial. No card required. VAT inclusive.</p>
        <div className="mt-8 sm:mt-12 grid gap-6 md:grid-cols-3">
          {PLANS.map((p) => (
            <div
              key={p.name}
              className={`rounded border bg-surface p-6 ${
                p.highlight ? 'border-green' : 'border-border'
              }`}
            >
              <div className="text-lg font-semibold">{p.name}</div>
              <div className="mt-2 text-2xl text-green">{p.price}</div>
              <ul className="mt-6 space-y-2 text-sm text-text2">
                {p.features.map((f) => (
                  <li key={f}>· {f}</li>
                ))}
              </ul>
              <Link
                href="/signup"
                className="mt-6 block rounded bg-surface2 px-4 py-2 text-center text-sm hover:bg-border"
              >
                Start trial
              </Link>
            </div>
          ))}
        </div>
      </section>
    </main>
  );
}

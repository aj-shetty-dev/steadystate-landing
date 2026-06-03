import { Monitor, ArrowLeft, HardDrive, Shield, Layout } from 'lucide-react';
import Link from 'next/link';

export const metadata = {
  title: 'Desktop Required — SteadyState',
  description: 'SteadyState CRM is optimized for desktop and laptop computers.',
};

const FEATURES = [
  {
    icon: Layout,
    title: 'Complex data views',
    description: 'Member tables, financial reports, and class schedules built for widescreen displays.',
  },
  {
    icon: Shield,
    title: 'Secure operations',
    description: 'Point-of-sale, billing reconciliation, and staff management require a trusted workstation environment.',
  },
  {
    icon: HardDrive,
    title: 'Full-featured workflows',
    description: 'Bulk member imports, WhatsApp broadcasts, and reporting tools designed for keyboard and mouse precision.',
  },
];

export default function DesktopOnlyPage() {
  return (
    <div className="relative flex min-h-dvh flex-col items-center justify-center bg-bg px-6 py-16">
      {/* Subtle radial gradient behind the icon */}
      <div
        className="pointer-events-none absolute inset-0 opacity-[0.03]"
        style={{
          background: 'radial-gradient(ellipse 60% 50% at 50% 35%, #00E87A 0%, transparent 70%)',
        }}
      />

      <div className="relative z-10 mx-auto flex w-full max-w-lg flex-col items-center text-center animate-fade-in">
        {/* Icon */}
        <div className="mb-8 flex h-20 w-20 items-center justify-center rounded-2xl border border-border bg-surface2 shadow-[0_0_40px_-8px_rgba(0,232,122,0.15)]">
          <Monitor className="h-9 w-9 text-green" strokeWidth={1.5} />
        </div>

        {/* Headline */}
        <h1 className="font-display text-[28px] font-semibold leading-tight tracking-[-0.02em] text-text sm:text-[32px]">
          Desktop required
        </h1>

        {/* Subhead */}
        <p className="mt-3 max-w-sm text-[15px] leading-relaxed text-text2">
          SteadyState is a professional CRM platform built for{' '}
          <span className="text-text">desktop and laptop computers</span>.
          Please switch devices to continue.
        </p>

        {/* Feature cards */}
        <div className="mt-10 grid w-full gap-3">
          {FEATURES.map(({ icon: Icon, title, description }) => (
            <div
              key={title}
              className="flex items-start gap-4 rounded-xl border border-border bg-surface px-5 py-4 text-left"
            >
              <div className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-surface2">
                <Icon className="h-4 w-4 text-green" strokeWidth={1.5} />
              </div>
              <div>
                <h3 className="text-sm font-medium text-text">{title}</h3>
                <p className="mt-0.5 text-[13px] leading-relaxed text-text3">{description}</p>
              </div>
            </div>
          ))}
        </div>

        {/* CTA */}
        <Link
          href="/"
          className="mt-10 inline-flex items-center gap-2 rounded-lg border border-border bg-surface2 px-5 py-2.5 text-[14px] font-medium text-text2 transition-colors hover:border-text3 hover:text-text"
        >
          <ArrowLeft className="h-4 w-4" strokeWidth={1.5} />
          Back to home
        </Link>

        {/* Footer */}
        <p className="mt-12 text-[12px] text-text3">
          Already at a desktop?{' '}
          <a
            href="mailto:support@steadystate.ae"
            className="text-text2 underline underline-offset-2 transition-colors hover:text-green"
          >
            Contact support
          </a>{' '}
          if you believe this is an error.
        </p>
      </div>
    </div>
  );
}

'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useRef, useState } from 'react';

/* ── Chart bar heights (static, matches reference design) ── */
const CHART_HEIGHTS = [30, 45, 35, 60, 50, 70, 55, 80, 65, 90, 72, 85, 60, 95, 78, 88, 70, 92, 68, 75, 85, 70, 95, 88, 75, 100, 82, 90, 78, 85];

/* ── CRM logo pills for scrolling strip ── */
const CRM_LOGOS = [
  { name: 'Mindbody', color: '#0072F0' },
  { name: 'ABC Glofox', color: '#F5A623' },
  { name: 'Zenoti', color: '#C850C0' },
  { name: 'Virtuagym', color: '#2ECC71' },
  { name: 'GymMaster', color: '#E74C3C' },
  { name: 'Simple Logic', color: '#5A5856' },
  { name: 'Elewix', color: '#5A5856' },
];

/* ── CRM integration cards ── */
const CRM_CARDS = [
  {
    name: 'Mindbody',
    market: '~40%',
    tier: 'BIG THREE · #1',
    tierClass: 'tier-1',
    featured: true,
    desc: "The 800-pound gorilla of boutique fitness. Powerful but clunky — which creates your intelligence opportunity. Used across Yoga, Pilates, F45, and wellness centers across the UAE.",
    edge: 'Real-time WhatsApp churn alerts',
  },
  {
    name: 'ABC Glofox',
    market: '~20%',
    tier: 'BIG THREE · #2',
    tierClass: 'tier-1',
    featured: true,
    desc: 'The fastest-growing enterprise choice in Dubai. Modern UI, loved by CrossFit boxes and HIIT studios. Great design — but weak on AI-driven retention and ancillary revenue.',
    edge: 'One-tap in-app supplement shop',
  },
  {
    name: 'Zenoti',
    market: 'Top 1%',
    tier: 'BIG THREE · #3',
    tierClass: 'tier-1',
    featured: true,
    desc: 'The go-to for multi-location luxury wellness clubs — DIFC, Jumeirah, Palm. Exquisite data architecture but no engagement automation layer. Waiting for a brain.',
    edge: 'Automated luxury upsell journeys',
  },
  {
    name: 'Virtuagym',
    market: '',
    tier: 'MID-MARKET',
    tierClass: 'tier-2',
    featured: false,
    desc: 'Popular UAE-wide for mid-sized gyms wanting integrated nutrition and workout tracking. High nutrition engagement — but payment recovery remains a blind spot.',
    edge: 'Salary-synced billing cycles',
  },
  {
    name: 'GymMaster',
    market: '',
    tier: 'MID-MARKET',
    tierClass: 'tier-2',
    featured: false,
    desc: 'The choice for 24/7 gyms in Dubai Marina and Business Bay with superior biometric/door access integration. Physical access data is gold — when connected to actions.',
    edge: 'Behavioural triggers from door events',
  },
  {
    name: 'Simple Logic / Elewix',
    market: '',
    tier: 'LOCAL',
    tierClass: 'tier-local',
    featured: false,
    desc: 'UAE-specific regional ERPs built for independent local gyms. Arabic support, VAT-ready, "Dubai-native." Underserved by Western AI tools — massive loyalty opportunity.',
    edge: 'Arabic WhatsApp flows + VAT billing',
  },
];

/* ── Features ── */
const FEATURES = [
  {
    num: '01',
    icon: '⚡',
    title: 'Real-Time Churn Triggers',
    desc: 'The moment a member goes 5 days without check-in, SteadyState fires a personalised WhatsApp message — before your staff even notices. Powered by live Mindbody and Glofox webhooks.',
    tag: 'Mindbody · Glofox · Zenoti',
    wide: false,
  },
  {
    num: '02',
    icon: '🛒',
    title: 'One-Tap Supplement Shop',
    desc: 'Surface a curated product shelf directly inside the member app at the moment of highest intent — post-workout. Every transaction feeds back to your Glofox revenue dashboard automatically.',
    tag: 'Glofox · Virtuagym',
    wide: false,
  },
  {
    num: '03',
    icon: '💳',
    title: 'Salary-Synced Billing',
    desc: 'UAE employees get paid on the 25th–28th. SteadyState shifts payment retry windows to align with salary credit dates — slashing failed payments by up to 60% with zero manual effort.',
    tag: 'Virtuagym · GymMaster · All CRMs',
    wide: false,
  },
  {
    num: '04',
    icon: '🚪',
    title: 'Door-Event Intelligence',
    desc: 'Turn biometric access logs from GymMaster into real member behaviour signals. First visit after 2 weeks? Trigger a re-engagement reward. 10th visit? Auto-upgrade upsell.',
    tag: 'GymMaster · Access-Enabled CRMs',
    wide: false,
  },
  {
    num: '05',
    icon: '🇦🇪',
    title: 'UAE-Native Compliance Layer',
    desc: 'VAT invoicing, Arabic WhatsApp notifications, DIFC-compliant data handling, and Ramadan-aware scheduling logic built in. SteadyState understands the Dubai market — not just the global fitness market. Simple Logic and Elewix users get a fully localised experience out of the box.',
    tag: 'Simple Logic · Elewix · All Platforms',
    wide: true,
  },
];

/* ── Testimonials ── */
const TESTIMONIALS = [
  {
    stars: '★★★★★',
    quote: 'We were losing 12–15 members a month silently through Mindbody. SteadyState flagged 8 of them within the first week and our team closed 6. The WhatsApp nudge timing is scarily accurate.',
    initials: 'KA',
    name: 'Khalid Al-Rashidi',
    role: 'Owner — Pure Pilates Studio, DIFC',
    avatarBg: 'rgba(0,232,122,0.1)',
    avatarColor: '#00E87A',
  },
  {
    stars: '★★★★★',
    quote: 'I was sceptical about another SaaS layer on top of Glofox. But SteadyState supplement shop feature generated AED 14,000 in its first 30 days. That paid for 6 months of subscription.',
    initials: 'SM',
    name: 'Sara Mansouri',
    role: 'GM — BOXED Functional Fitness, JLT',
    avatarBg: 'rgba(245,166,35,0.1)',
    avatarColor: '#F5A623',
  },
  {
    stars: '★★★★★',
    quote: 'The salary-sync billing is a game-changer for Dubai. We used to have 18–20 failed payment retries every month-end. Now it\'s under 5. My finance team literally hugged me.',
    initials: 'RP',
    name: 'Rajan Pillai',
    role: 'CEO — FitZone 24/7, Dubai Marina',
    avatarBg: 'rgba(200,80,192,0.1)',
    avatarColor: '#C850C0',
  },
];

/* ── Tier styling helper ── */
function tierStyles(tierClass: string) {
  if (tierClass === 'tier-1') return 'bg-green/10 text-green border border-green/20';
  if (tierClass === 'tier-2') return 'bg-amber-500/10 text-[#F5A623] border border-amber-500/20';
  return 'bg-surface2 text-text3 border border-border';
}

export default function HomePage() {
  const router = useRouter();
  const [scrolled, setScrolled] = useState(false);
  const [ctaEmail, setCtaEmail] = useState('');
  const [ctaState, setCtaState] = useState<'idle' | 'success' | 'error'>('idle');
  const [covFills, setCovFills] = useState({ cov1: '0%', cov2: '0%', cov3: '0%' });
  const [stepsLine, setStepsLine] = useState('0%');

  // Scroll listener for nav
  useEffect(() => {
    const handler = () => setScrolled(window.scrollY > 40);
    window.addEventListener('scroll', handler, { passive: true });
    handler();
    return () => window.removeEventListener('scroll', handler);
  }, []);

  // Intersection observer for animations
  const gapRef = useRef<HTMLElement>(null);
  const hiwRef = useRef<HTMLElement>(null);

  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            entry.target.classList.add('visible');
          }
        });
      },
      { threshold: 0.15 },
    );

    document.querySelectorAll('.fade-up').forEach((el) => observer.observe(el));

    // Gap section fill bars
    const gapEl = gapRef.current;
    const hiwEl = hiwRef.current;

    const gapObserver = new IntersectionObserver(
      (entries) => {
        if (entries[0]?.isIntersecting) {
          setTimeout(() => setCovFills({ cov1: '70%', cov2: '94%', cov3: '75%' }), 300);
        }
      },
      { threshold: 0.15 },
    );
    if (gapEl) gapObserver.observe(gapEl);

    const hiwObserver = new IntersectionObserver(
      (entries) => {
        if (entries[0]?.isIntersecting) {
          setTimeout(() => setStepsLine('100%'), 400);
        }
      },
      { threshold: 0.15 },
    );
    if (hiwEl) hiwObserver.observe(hiwEl);

    return () => {
      observer.disconnect();
      gapObserver.disconnect();
      hiwObserver.disconnect();
    };
  }, []);

  const handleCTA = useCallback(() => {
    if (ctaEmail && ctaEmail.includes('@')) {
      setCtaState('success');
    } else {
      setCtaState('error');
    }
  }, [ctaEmail]);

  return (
    <main className="min-h-screen bg-[#080808] text-[#F2F0EA] overflow-x-hidden">
      {/* ═══════════════ NAV ═══════════════ */}
      <nav
        className={`fixed top-0 left-0 right-0 z-50 h-16 flex items-center justify-between transition-all duration-300 ${
          scrolled ? 'bg-[#080808]/90 border-b border-border backdrop-blur-xl' : 'border-b border-transparent'
        }`}
        style={{ padding: '0 clamp(16px, 4vw, 48px)' }}
      >
        <Link href="#" className="flex items-center gap-2.5 font-bold text-[22px] tracking-[-0.01em] text-[#FAFAF8]">
          <span className="w-2 h-2 rounded-full bg-green shadow-[0_0_0_3px_rgba(0,232,122,0.12)] animate-[pulse-dot_2s_ease-in-out_infinite]" />
          STEADYSTATE
        </Link>
        <div className="hidden sm:flex items-center gap-8">
          <a href="#integrations" className="text-sm font-medium text-text2 tracking-[0.3px] hover:text-text transition-colors">Integrations</a>
          <a href="#features" className="text-sm font-medium text-text2 tracking-[0.3px] hover:text-text transition-colors">Features</a>
          <a href="#how-it-works" className="text-sm font-medium text-text2 tracking-[0.3px] hover:text-text transition-colors">How It Works</a>
          <Link href="/pricing" className="text-sm font-medium text-text2 tracking-[0.3px] hover:text-text transition-colors">Pricing</Link>
        </div>
        <div className="flex items-center gap-3 sm:gap-4">
          <Link
            href="/sign-in"
            className="px-4 sm:px-5 py-2 sm:py-2.5 text-[13px] font-medium text-text2 hover:text-text border border-[#2E2E2E] hover:border-text3 rounded-md tracking-[0.3px] transition-all"
          >
            Login
          </Link>
          <a
            href="#cta"
            className="px-4 sm:px-[22px] py-2 sm:py-2.5 bg-green text-black text-[13px] font-semibold rounded-md tracking-[0.3px] hover:opacity-90 hover:-translate-y-px transition-all"
          >
            Request Demo
          </a>
        </div>
      </nav>

      {/* ═══════════════ HERO ═══════════════ */}
      <section
        className="relative min-h-screen flex items-center overflow-hidden"
        style={{ padding: 'clamp(80px, 10vw, 120px) clamp(16px, 4vw, 48px) clamp(48px, 6vw, 80px)' }}
      >
        {/* Grid background */}
        <div
          className="absolute inset-0 opacity-35"
          style={{
            backgroundImage: 'linear-gradient(#242424 1px, transparent 1px), linear-gradient(90deg, #242424 1px, transparent 1px)',
            backgroundSize: '64px 64px',
            maskImage: 'radial-gradient(ellipse 80% 80% at 50% 50%, black 30%, transparent 100%)',
            WebkitMaskImage: 'radial-gradient(ellipse 80% 80% at 50% 50%, black 30%, transparent 100%)',
          }}
        />
        {/* Glow */}
        <div className="absolute w-[600px] h-[600px] bg-[radial-gradient(circle,rgba(0,232,122,0.07)_0%,transparent_70%)] top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 pointer-events-none" />

        <div className="relative z-10 max-w-[1280px] mx-auto w-full grid grid-cols-1 lg:grid-cols-2 gap-12 lg:gap-20 items-center">
          {/* Left content */}
          <div>
            {/* Eyebrow */}
            <div className="inline-flex items-center gap-2 font-semibold text-[11px] tracking-[0.08em] uppercase text-green bg-green/10 border border-green/20 px-3.5 py-1.5 rounded-full mb-7">
              <span className="w-1.5 h-1.5 rounded-full bg-green animate-[pulse-dot_1.5s_ease-in-out_infinite]" />
              Intelligence Layer for UAE Gyms
            </div>

            <h1 className="font-extrabold text-[clamp(48px,6vw,96px)] leading-[0.95] tracking-[-0.02em] text-[#FAFAF8] mb-7">
              GIVE YOUR<br />CRM <em className="not-italic text-green relative">A BRAIN.</em>
            </h1>

            <p className="text-base sm:text-lg text-text2 leading-relaxed max-w-[500px] mb-11 font-light">
              SteadyState connects to <strong className="text-text font-medium">Mindbody, Glofox, Zenoti</strong> and more — then acts on your data
              automatically. Real-time churn alerts. One-tap revenue triggers. Salary-synced billing. All without
              switching your CRM.
            </p>

            <div className="flex items-center gap-4 flex-wrap">
              <a
                href="#cta"
                className="inline-flex items-center gap-2 px-8 py-3.5 bg-green text-black text-sm font-semibold rounded-md tracking-[0.3px] hover:opacity-90 hover:-translate-y-px transition-all"
              >
                <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
                  <path d="M3 8h10M9 4l4 4-4 4" stroke="#000" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
                Connect Your CRM Free
              </a>
              <a
                href="#how-it-works"
                className="inline-flex items-center gap-2 px-7 py-3.5 bg-transparent text-text text-sm font-medium rounded-md border border-[#2E2E2E] hover:border-text3 hover:bg-surface2 transition-all"
              >
                <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
                  <circle cx="8" cy="8" r="6" stroke="currentColor" strokeWidth="1.2" />
                  <path d="M6.5 6l3 2-3 2" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
                See How It Works
              </a>
            </div>

            {/* Hero stats */}
            <div className="flex gap-8 mt-12 pt-12 border-t border-border flex-wrap sm:flex-nowrap">
              <div>
                <div className="font-bold text-4xl text-[#FAFAF8] leading-none tracking-[-0.01em]">
                  <em className="not-italic text-green">70%</em>
                </div>
                <div className="text-xs text-text3 mt-1 tracking-[0.3px]">UAE premium gym market covered</div>
              </div>
              <div>
                <div className="font-bold text-4xl text-[#FAFAF8] leading-none tracking-[-0.01em]">
                  60<em className="not-italic text-green">s</em>
                </div>
                <div className="text-xs text-text3 mt-1 tracking-[0.3px]">To connect your existing CRM</div>
              </div>
              <div>
                <div className="font-bold text-4xl text-[#FAFAF8] leading-none tracking-[-0.01em]">
                  <em className="not-italic text-green">3×</em>
                </div>
                <div className="text-xs text-text3 mt-1 tracking-[0.3px]">Retention improvement avg.</div>
              </div>
            </div>
          </div>

          {/* Right: Dashboard mockup visual */}
          <div className="hidden lg:block relative">
            {/* Main card */}
            <div className="relative bg-surface border border-border rounded-xl p-6 overflow-hidden mr-[60px]" style={{ boxShadow: '0 0 0 0 transparent' }}>
              <div className="absolute top-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-green to-transparent opacity-50" />
              <div className="flex justify-between items-center mb-5">
                <div className="text-xs text-text2 tracking-[0.5px] uppercase font-semibold">Member Activity — Last 30 Days</div>
                <div className="text-[10px] font-semibold text-green bg-green/10 border border-green/20 px-2 py-0.5 rounded tracking-[0.5px]">● LIVE</div>
              </div>
              {/* Chart */}
              <div className="h-20 flex items-end gap-1 mb-4">
                {CHART_HEIGHTS.map((h, i) => (
                  <div
                    key={i}
                    className={`flex-1 rounded-t-sm transition-all ${
                      i === 29 ? 'bg-green' : h > 85 ? 'bg-[#FF3D57]/70' : h < 40 ? 'bg-[#FF3D57]/70' : 'bg-surface2'
                    } ${h > 85 && i !== 29 ? 'bg-green/80' : ''}`}
                    style={{ height: `${h}%` }}
                  />
                ))}
              </div>
              {/* Metric mini cards */}
              <div className="flex gap-3 mb-4">
                <div className="flex-1 bg-surface2 rounded-md p-3 border border-border">
                  <div className="text-xl font-semibold text-green leading-none mb-1">847</div>
                  <div className="text-[11px] text-text3">Active Members</div>
                </div>
                <div className="flex-1 bg-surface2 rounded-md p-3 border border-border">
                  <div className="text-xl font-semibold text-[#FF3D57] leading-none mb-1">23</div>
                  <div className="text-[11px] text-text3">At-Risk Now</div>
                </div>
                <div className="flex-1 bg-surface2 rounded-md p-3 border border-border">
                  <div className="text-xl font-semibold text-text leading-none mb-1">AED 4.2k</div>
                  <div className="text-[11px] text-text3">Recovered MRR</div>
                </div>
              </div>
              {/* Alert row */}
              <div className="flex items-center gap-2.5 bg-[#FF3D57]/5 border border-[#FF3D57]/15 rounded-md px-3.5 py-2.5">
                <span className="w-1.5 h-1.5 rounded-full bg-[#FF3D57] flex-shrink-0 animate-pulse" />
                <span className="text-xs text-text2"><strong className="text-text font-medium">Sara M.</strong> — 7 days inactive. Membership expires in 3 days.</span>
                <span className="ml-auto text-[11px] font-semibold text-green whitespace-nowrap">NUDGE →</span>
              </div>
            </div>

            {/* Stacked integration card */}
            <div
              className="absolute -right-5 -bottom-8 w-[220px] bg-surface2 border border-[#2E2E2E] rounded-xl p-4"
              style={{ boxShadow: '0 24px 60px rgba(0,0,0,0.5)' }}
            >
              <div className="text-[10px] text-text3 uppercase tracking-[1px] mb-2 font-semibold">Connected CRMs</div>
              {[
                { code: 'MBO', name: 'Mindbody', bg: 'rgba(0,114,240,0.12)', color: '#0072F0', status: 'live', statusColor: 'text-green' },
                { code: 'GFX', name: 'Glofox', bg: 'rgba(245,166,35,0.12)', color: '#F5A623', status: 'live', statusColor: 'text-green' },
                { code: 'ZNT', name: 'Zenoti', bg: 'rgba(255,61,87,0.1)', color: '#FF3D57', status: 'syncing', statusColor: 'text-[#F5A623]' },
              ].map((crm) => (
                <div key={crm.code} className="flex items-center gap-2 py-1.5 border-b border-border last:border-b-0">
                  <div className="w-7 h-7 rounded-md flex items-center justify-center text-[10px] font-bold flex-shrink-0" style={{ background: crm.bg, color: crm.color }}>{crm.code}</div>
                  <span className="text-xs text-text font-medium">{crm.name}</span>
                  <span className={`ml-auto text-[10px] font-medium ${crm.statusColor}`}>
                    {crm.status === 'live' ? '● live' : '↻ syncing'}
                  </span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* ═══════════════ LOGOS STRIP ═══════════════ */}
      <div className="py-8 border-y border-border bg-surface overflow-hidden" style={{ paddingLeft: 'clamp(16px, 4vw, 48px)', paddingRight: 'clamp(16px, 4vw, 48px)' }}>
        <div className="max-w-[1280px] mx-auto flex items-center gap-4">
          <span className="text-[11px] text-text3 tracking-[1px] uppercase whitespace-nowrap font-semibold flex-shrink-0 mr-4">Integrates with</span>
          <div className="flex-1 overflow-hidden" style={{ maskImage: 'linear-gradient(90deg, transparent, black 10%, black 90%, transparent)', WebkitMaskImage: 'linear-gradient(90deg, transparent, black 10%, black 90%, transparent)' }}>
            <div className="flex gap-0 animate-[scroll-logos_20s_linear_infinite] whitespace-nowrap" style={{ width: 'max-content' }}>
              {[...CRM_LOGOS, ...CRM_LOGOS].map((logo, i) => (
                <span key={i} className="inline-flex items-center gap-2 px-5 py-2 border border-[#2E2E2E] rounded-full mx-2 text-[13px] font-medium text-text2 whitespace-nowrap bg-surface2">
                  <span className="w-1.5 h-1.5 rounded-full flex-shrink-0" style={{ background: logo.color }} />
                  {logo.name}
                </span>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* ═══════════════ THE GAP ═══════════════ */}
      <section className="fade-up bg-surface py-[72px] lg:py-[100px]" style={{ paddingLeft: 'clamp(16px, 4vw, 48px)', paddingRight: 'clamp(16px, 4vw, 48px)' }} ref={gapRef}>
        <div className="max-w-[1280px] mx-auto grid grid-cols-1 lg:grid-cols-2 gap-10 lg:gap-16 items-start">
          <div>
            <div className="font-semibold text-[11px] tracking-[0.08em] uppercase text-green mb-4">The Intelligence Gap</div>
            <h2 className="font-extrabold text-[clamp(36px,4vw,64px)] leading-[0.95] tracking-[-0.02em] text-[#FAFAF8] mb-5">
              GREAT AT STORING. TERRIBLE AT <em className="not-italic text-green">ACTING.</em>
            </h2>
            <table className="w-full mt-12 border-collapse">
              <thead>
                <tr>
                  <th className="font-semibold text-[10px] tracking-[0.08em] uppercase text-text3 pb-4 text-left border-b border-border">CRM</th>
                  <th className="font-semibold text-[10px] tracking-[0.08em] uppercase text-text3 pb-4 text-left border-b border-border">The Gap</th>
                  <th className="font-semibold text-[10px] tracking-[0.08em] uppercase text-green pb-4 text-left border-b border-border">SteadyState Fills It</th>
                </tr>
              </thead>
              <tbody>
                {[
                  { crm: 'Mindbody', gap: 'Slow to alert staff of churn risk', fill: 'Real-time WhatsApp churn trigger' },
                  { crm: 'Glofox', gap: 'Weak ancillary revenue tooling', fill: 'One-tap supplement shop' },
                  { crm: 'Virtuagym', gap: 'Generic payment recovery', fill: 'Salary-synced billing cycles' },
                  { crm: 'Zenoti', gap: 'Luxury data, no engagement layer', fill: 'Automated premium upsell flows' },
                  { crm: 'GymMaster', gap: 'Access data isolated from CRM', fill: 'Behavioural triggers from door events' },
                ].map((row) => (
                  <tr key={row.crm}>
                    <td className="py-5 text-sm font-semibold text-[#FAFAF8] border-b border-border align-top pr-6 w-[120px]">
                      <span className="inline-block px-2 py-0.5 bg-surface2 border border-[#2E2E2E] rounded text-[11px] font-semibold text-text2 mb-1">{row.crm}</span>
                    </td>
                    <td className="py-5 text-sm text-text3 border-b border-border align-top pr-6 font-light">{row.gap}</td>
                    <td className="py-5 text-sm text-text2 border-b border-border align-top">{row.fill}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="pt-5 lg:pt-5">
            <div className="border-l-2 border-green p-6 lg:p-7 bg-green/5 rounded-r-md mb-8">
              <p className="text-base sm:text-lg italic text-text font-light leading-relaxed">
                &ldquo;We don&apos;t want you to leave Mindbody. We just want to give Mindbody a brain.&rdquo;
              </p>
              <cite className="block mt-3 text-xs text-text3 not-italic tracking-[0.5px]">— Nuviq Strategy · SteadyState Core Principle</cite>
            </div>

            {[
              { label: 'Premium UAE Market Coverage', value: '~70%', width: covFills.cov1, gradient: 'from-[#00C268] to-green' },
              { label: 'Setup Time Reduction', value: '↓ 94%', width: covFills.cov2, gradient: 'from-[#C850C0] to-[#F5A623]' },
              { label: 'Member Retention Improvement', value: 'Avg. 3×', width: covFills.cov3, gradient: 'from-[#F5A623] to-green' },
            ].map((bar, i) => (
              <div key={i} className="mt-4 first:mt-0">
                <div className="flex justify-between items-center mb-2">
                  <span className="text-xs text-text3 font-medium">{bar.label}</span>
                  <strong className="text-sm text-green font-semibold tabular-nums">{bar.value}</strong>
                </div>
                <div className="h-1.5 bg-surface2 rounded-sm overflow-hidden">
                  <div
                    className={`h-full rounded-sm bg-gradient-to-r ${bar.gradient} transition-all duration-[1500ms] ease-[cubic-bezier(0.4,0,0.2,1)]`}
                    style={{ width: bar.width }}
                  />
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ═══════════════ INTEGRATIONS ═══════════════ */}
      <section className="fade-up bg-[#080808] py-[72px] lg:py-[100px]" id="integrations" style={{ paddingLeft: 'clamp(16px, 4vw, 48px)', paddingRight: 'clamp(16px, 4vw, 48px)' }}>
        <div className="max-w-[1280px] mx-auto">
          <div className="flex flex-col lg:flex-row justify-between items-start lg:items-end gap-5 mb-14">
            <div>
              <div className="font-semibold text-[11px] tracking-[0.08em] uppercase text-green mb-4">CRM Integrations</div>
              <h2 className="font-extrabold text-[clamp(36px,4vw,64px)] leading-[0.95] tracking-[-0.02em] text-[#FAFAF8]">
                PLUG INTO <em className="not-italic text-green">YOUR MARKET</em>
              </h2>
            </div>
            <p className="text-sm text-text2 font-light max-w-[360px]">Connect your existing CRM in 60 seconds. No migration. No downtime. Just intelligence.</p>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {CRM_CARDS.map((crm) => (
              <div
                key={crm.name}
                className={`bg-surface border rounded-xl p-7 relative overflow-hidden transition-all duration-300 hover:-translate-y-1 cursor-default ${
                  crm.featured ? 'border-green/25 bg-gradient-to-br from-surface to-green/5' : 'border-border hover:border-[#2E2E2E]'
                }`}
              >
                {crm.featured && (
                  <div className="absolute top-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-green to-transparent" />
                )}
                {crm.market && (
                  <div className="absolute top-6 right-6 font-semibold text-[13px] text-text3 tracking-[-0.01em]">
                    <em className="not-italic text-green">{crm.market}</em> market
                  </div>
                )}
                <span className={`inline-block text-[9px] tracking-[0.08em] uppercase font-semibold px-2 py-0.5 rounded-sm mb-4 ${tierStyles(crm.tierClass)}`}>
                  {crm.tier}
                </span>
                <div className="font-bold text-[28px] tracking-[-0.01em] text-[#FAFAF8] mb-1.5">{crm.name}</div>
                <p className="text-[13px] text-text2 leading-relaxed mb-5 font-light">{crm.desc}</p>
                <div className="bg-surface2 border border-border rounded-md px-3.5 py-2.5">
                  <div className="text-[10px] text-text3 tracking-[0.08em] uppercase font-semibold mb-1">SteadyState Edge</div>
                  <div className="text-[13px] text-green font-medium">→ {crm.edge}</div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ═══════════════ FEATURES ═══════════════ */}
      <section className="fade-up bg-surface py-[72px] lg:py-[100px]" id="features" style={{ paddingLeft: 'clamp(16px, 4vw, 48px)', paddingRight: 'clamp(16px, 4vw, 48px)' }}>
        <div className="max-w-[1280px] mx-auto">
          <div className="font-semibold text-[11px] tracking-[0.08em] uppercase text-green mb-4">Core Intelligence</div>
          <h2 className="font-extrabold text-[clamp(36px,4vw,64px)] leading-[0.95] tracking-[-0.02em] text-[#FAFAF8] mb-14">
            WHAT WE <em className="not-italic text-green">AUTOMATE</em>
          </h2>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-[2px] bg-border rounded-xl overflow-hidden">
            {FEATURES.map((feat) => (
              <div
                key={feat.num}
                className={`bg-surface p-8 lg:p-12 relative overflow-hidden transition-colors hover:bg-surface2 group ${feat.wide ? 'lg:col-span-2' : ''}`}
              >
                <div className="font-extrabold text-[80px] leading-none text-surface2 absolute top-5 right-6 tracking-[-0.03em] select-none transition-colors group-hover:text-[#2E2E2E]">
                  {feat.num}
                </div>
                <div className="w-11 h-11 rounded-md bg-green/10 border border-green/20 flex items-center justify-center text-xl mb-6">
                  {feat.icon}
                </div>
                <div className="font-bold text-[26px] tracking-[-0.01em] text-[#FAFAF8] mb-3">{feat.title}</div>
                <p className={`text-sm text-text2 leading-relaxed font-light ${feat.wide ? 'max-w-full' : 'max-w-[380px]'}`}>
                  {feat.desc}
                </p>
                <div className="inline-flex items-center gap-1.5 mt-5 text-[11px] font-medium text-text3">
                  <span className="text-green">→</span> {feat.tag}
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ═══════════════ HOW IT WORKS ═══════════════ */}
      <section className="fade-up bg-[#080808] py-[72px] lg:py-[100px]" id="how-it-works" ref={hiwRef} style={{ paddingLeft: 'clamp(16px, 4vw, 48px)', paddingRight: 'clamp(16px, 4vw, 48px)' }}>
        <div className="max-w-[1280px] mx-auto">
          <div className="text-center mb-[72px]">
            <div className="font-semibold text-[11px] tracking-[0.08em] uppercase text-green mb-4">Setup</div>
            <h2 className="font-extrabold text-[clamp(36px,4vw,64px)] leading-[0.95] tracking-[-0.02em] text-[#FAFAF8] mb-5">
              CONNECTED IN <em className="not-italic text-green">60 SECONDS</em>
            </h2>
            <p className="text-base text-text2 font-light max-w-[560px] mx-auto">No migrations. No API developers. No disruption to your team.</p>
          </div>

          <div className="relative">
            {/* Timeline line (hidden on mobile) */}
            <div className="hidden lg:block absolute top-8 left-[calc(16.666%+32px)] right-[calc(16.666%+32px)] h-px bg-[#2E2E2E]">
              <div className="h-full bg-gradient-to-r from-green to-[#00C268] transition-all duration-[1500ms] ease-out" style={{ width: stepsLine }} />
            </div>

            <div className="flex flex-col lg:flex-row items-stretch gap-0">
              {[
                { num: '1', time: '0:00 — 0:10', title: 'Choose Your CRM', desc: 'Select Mindbody, Glofox, Zenoti, or any supported platform from the connector library.' },
                { num: '2', time: '0:10 — 0:30', title: 'Authorise Access', desc: 'OAuth one-click authentication. We read your data — we never write to your CRM without your rules.' },
                { num: '3', time: '0:30 — 0:50', title: 'Set Your Triggers', desc: 'Choose from pre-built UAE-ready automation playbooks, or define custom rules in plain language.' },
                { num: '4', time: '0:50 — 1:00', title: 'Go Live', desc: 'SteadyState begins monitoring your member data in real time. Your CRM just got a brain.' },
              ].map((step, i) => (
                <div key={step.num} className="flex-1 flex flex-col items-center text-center px-6 py-4 lg:py-0 relative fade-up" style={{ transitionDelay: `${i * 100}ms` }}>
                  <div className="w-16 h-16 rounded-full bg-surface border border-[#2E2E2E] flex items-center justify-center font-bold text-[22px] tracking-[-0.01em] text-text3 mb-6 relative z-10 transition-all hover:bg-green hover:border-green hover:text-black">
                    {step.num}
                  </div>
                  <div className="font-medium text-[10px] tracking-[0.08em] uppercase text-green mb-2">{step.time}</div>
                  <div className="text-base font-semibold text-[#FAFAF8] mb-2">{step.title}</div>
                  <p className="text-[13px] text-text2 leading-relaxed font-light">{step.desc}</p>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* ═══════════════ SOCIAL PROOF ═══════════════ */}
      <section className="fade-up bg-surface py-20 lg:py-20" style={{ paddingLeft: 'clamp(16px, 4vw, 48px)', paddingRight: 'clamp(16px, 4vw, 48px)' }}>
        <div className="max-w-[1280px] mx-auto">
          <div className="font-semibold text-[11px] tracking-[0.08em] uppercase text-green mb-4">By The Numbers</div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mt-12">
            {[
              { val: '94%', isEm: true, label: 'Reduction in manual churn follow-up time' },
              { val: 'AED 3.8k', isEm: true, label: 'Average monthly MRR recovered per gym' },
              { val: '2.7×', isEm: true, label: 'Increase in ancillary product revenue' },
              { val: '60%', isEm: true, label: 'Drop in failed payment rate with salary-sync' },
            ].map((stat) => (
              <div key={stat.label} className="bg-surface2 border border-border rounded-xl p-7">
                <div className="font-extrabold text-[52px] leading-none tracking-[-0.02em] text-[#FAFAF8] mb-2">
                  {stat.isEm ? (
                    <><em className="not-italic text-green">{stat.val.split(' ')[0]}</em>{stat.val.includes(' ') ? ' ' + stat.val.split(' ').slice(1).join(' ') : ''}</>
                  ) : stat.val}
                </div>
                <div className="text-[13px] text-text2 font-light">{stat.label}</div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ═══════════════ TESTIMONIALS ═══════════════ */}
      <section className="fade-up bg-[#080808] py-[72px] lg:py-[100px]" style={{ paddingLeft: 'clamp(16px, 4vw, 48px)', paddingRight: 'clamp(16px, 4vw, 48px)' }}>
        <div className="max-w-[1280px] mx-auto">
          <div className="font-semibold text-[11px] tracking-[0.08em] uppercase text-green mb-4">Early Adopters</div>
          <h2 className="font-extrabold text-[clamp(36px,4vw,64px)] leading-[0.95] tracking-[-0.02em] text-[#FAFAF8] mb-14">
            WHAT GYM OWNERS <em className="not-italic text-green">SAY</em>
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
            {TESTIMONIALS.map((t) => (
              <div key={t.name} className="bg-surface border border-border rounded-xl p-8">
                <div className="text-[#F5A623] text-sm mb-4 tracking-[2px]">{t.stars}</div>
                <p className="text-[15px] text-text2 leading-relaxed font-light mb-6 italic">&ldquo;{t.quote}&rdquo;</p>
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-full flex items-center justify-center text-sm font-semibold flex-shrink-0" style={{ background: t.avatarBg, color: t.avatarColor }}>
                    {t.initials}
                  </div>
                  <div>
                    <div className="text-sm font-semibold text-[#FAFAF8]">{t.name}</div>
                    <div className="text-xs text-text3">{t.role}</div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ═══════════════ CTA ═══════════════ */}
      <section className="fade-up bg-surface py-[100px] lg:py-[120px] relative overflow-hidden" id="cta" style={{ paddingLeft: 'clamp(16px, 4vw, 48px)', paddingRight: 'clamp(16px, 4vw, 48px)' }}>
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_60%_60%_at_50%_100%,rgba(0,232,122,0.06)_0%,transparent_70%)]" />
        <div className="max-w-[760px] mx-auto text-center relative z-10">
          <div className="font-semibold text-[11px] tracking-[0.08em] uppercase text-green mb-4">Start Free · No CRM Migration</div>
          <h2 className="font-extrabold text-[clamp(40px,5vw,80px)] leading-[0.95] tracking-[-0.02em] text-[#FAFAF8] mb-5">
            READY TO GIVE YOUR<br />CRM <em className="not-italic text-green">A BRAIN?</em>
          </h2>
          <p className="text-base text-text2 leading-relaxed font-light mb-11">
            Connect your Mindbody, Glofox, or Zenoti account in 60 seconds. First 30 days free. Cancel anytime.
          </p>

          <form
            onSubmit={(e) => {
              e.preventDefault();
              handleCTA();
            }}
            className="flex flex-col sm:flex-row gap-3 max-w-[480px] mx-auto mb-5"
          >
            <input
              type="email"
              value={ctaEmail}
              onChange={(e) => {
                setCtaEmail(e.target.value);
                setCtaState('idle');
              }}
              placeholder="your@gym.com"
              className={`flex-1 bg-surface2 border rounded-md px-[18px] py-3.5 text-sm text-text outline-none transition-colors ${
                ctaState === 'error' ? 'border-[#FF3D57]' : 'border-[#2E2E2E] focus:border-green'
              }`}
            />
            <button
              type="submit"
              className={`inline-flex items-center justify-center gap-2 px-8 py-3.5 text-sm font-semibold rounded-md tracking-[0.3px] transition-all hover:-translate-y-px ${
                ctaState === 'success' ? 'bg-green text-black' : 'bg-green text-black hover:opacity-90'
              }`}
            >
              {ctaState === 'success' ? (
                <>✓ You&apos;re on the list!</>
              ) : (
                <>
                  Get Started
                  <svg width="14" height="14" viewBox="0 0 16 16" fill="none">
                    <path d="M3 8h10M9 4l4 4-4 4" stroke="#000" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                </>
              )}
            </button>
          </form>
          <p className="text-xs text-text3">
            No credit card required · UAE data hosted locally · <Link href="/pricing" className="text-text2 underline underline-offset-2">Pricing</Link>
          </p>
        </div>
      </section>

      {/* ═══════════════ FOOTER ═══════════════ */}
      <footer className="bg-[#080808] border-t border-border py-16 lg:py-16" style={{ paddingLeft: 'clamp(16px, 4vw, 48px)', paddingRight: 'clamp(16px, 4vw, 48px)' }}>
        <div className="max-w-[1280px] mx-auto">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-[2fr_1fr_1fr_1fr] gap-8 lg:gap-16 mb-16">
            {/* Brand col */}
            <div>
              <div className="flex items-center gap-2.5 font-bold text-xl tracking-[-0.01em] text-[#FAFAF8] mb-4">
                <span className="w-2 h-2 rounded-full bg-green shadow-[0_0_0_3px_rgba(0,232,122,0.12)]" />
                STEADYSTATE
              </div>
              <p className="text-[13px] text-text3 leading-relaxed max-w-[280px] font-light">
                The Intelligence Layer for UAE Gym Operators. Plug into your existing CRM and turn member data into automated, high-value actions.
              </p>
              <div className="flex gap-3 mt-5">
                {['in', '𝕏', 'Ig'].map((label) => (
                  <a
                    key={label}
                    href="#"
                    className="w-9 h-9 rounded-md bg-surface2 border border-border flex items-center justify-center text-text3 text-sm transition-colors hover:text-text hover:border-[#2E2E2E]"
                  >
                    {label}
                  </a>
                ))}
              </div>
            </div>

            {[
              { title: 'Product', links: ['Integrations', 'Features', 'Pricing', 'Changelog', 'Roadmap'] },
              { title: 'Resources', links: ['Documentation', 'API Reference', 'UAE Fitness Guide', 'Case Studies', 'Blog'] },
              { title: 'Company', links: ['About Nuviq', 'Careers', 'Contact', 'Dubai Office', 'Press Kit'] },
            ].map((col) => (
              <div key={col.title}>
                <h5 className="text-[11px] text-text3 tracking-[0.08em] uppercase font-semibold mb-5">{col.title}</h5>
                <ul className="space-y-2.5">
                  {col.links.map((link) => (
                    <li key={link}>
                      <a href="#" className="text-[13px] text-text2 hover:text-text transition-colors font-light">{link}</a>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>

          <div className="flex flex-col sm:flex-row justify-between items-center gap-4 pt-8 border-t border-border">
            <div className="text-xs text-text3">
              © 2026 <span className="text-green">SteadyState</span> by Nuviq · Dubai, UAE · VAT Registration: 100XXXXXXXXX
            </div>
            <div className="flex gap-6">
              {['Privacy Policy', 'Terms of Service', 'Data Processing', 'Cookie Preferences'].map((link) => (
                <a key={link} href="#" className="text-xs text-text3 hover:text-text2 transition-colors">{link}</a>
              ))}
            </div>
          </div>
        </div>
      </footer>

      {/* ═══════════════ GLOBAL ANIMATIONS ═══════════════ */}
      <style jsx global>{`
        @keyframes pulse-dot {
          0%, 100% { box-shadow: 0 0 0 3px rgba(0,232,122,0.12); }
          50% { box-shadow: 0 0 0 6px rgba(0,232,122,0.06); }
        }
        @keyframes scroll-logos {
          from { transform: translateX(0); }
          to { transform: translateX(-50%); }
        }
        .fade-up {
          opacity: 0;
          transform: translateY(24px);
          transition: opacity 0.7s ease, transform 0.7s ease;
        }
        .fade-up.visible {
          opacity: 1;
          transform: translateY(0);
        }
      `}</style>
    </main>
  );
}

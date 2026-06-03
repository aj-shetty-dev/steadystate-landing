'use client';

import { useClerk } from '@clerk/nextjs';
import {
  Building2,
  CalendarDays,
  FileText,
  LayoutDashboard,
  LogOut,
  type LucideIcon,
  Menu,
  MessageSquare,
  Receipt,
  ScanLine,
  UserCog,
  Users,
  Wallet,
  X,
} from 'lucide-react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect, useState } from 'react';
import { ThemeToggle } from '../../components/theme-toggle';
import type { SessionUser } from '../../lib/session';

interface NavItem {
  href: string;
  label: string;
  icon: LucideIcon;
}

const NAV: NavItem[] = [
  { href: '/overview',     label: 'Overview',     icon: LayoutDashboard },
  { href: '/members',      label: 'Members',      icon: Users },
  { href: '/memberships',  label: 'Memberships',  icon: FileText },
  { href: '/classes',      label: 'Classes',      icon: CalendarDays },
  { href: '/checkins',     label: 'Check-ins',    icon: ScanLine },
  { href: '/pos',          label: 'POS',          icon: Receipt },
  { href: '/staff',        label: 'Staff',        icon: UserCog },
  { href: '/billing',      label: 'Billing',      icon: Wallet },
  { href: '/messages',     label: 'Messages',     icon: MessageSquare },
];

function userInitials(fullName: string): string {
  const parts = fullName.trim().split(/\s+/);
  if (parts.length === 0 || !parts[0]) return '?';
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

function NavLinks({
  pendingHref,
  onNavigate,
}: {
  pendingHref: string | null;
  onNavigate: (href: string) => void;
}) {
  const pathname = usePathname();

  return (
    <>
      {NAV.map((item) => {
        const isActive = pathname === item.href || pathname.startsWith(`${item.href}/`);
        const isPending = pendingHref === item.href;
        const highlighted = pendingHref ? isPending : isActive;
        const Icon = item.icon;
        return (
          <Link
            key={item.href}
            href={item.href}
            onClick={() => onNavigate(item.href)}
            className={`group flex items-center justify-between gap-2 px-3 py-2 rounded-md text-sm transition-colors ${
              highlighted
                ? 'bg-green/10 text-green'
                : 'text-text2 hover:text-text hover:bg-surface2'
            }`}
          >
            <span className="flex items-center gap-2.5 min-w-0">
              <Icon
                className={`w-4 h-4 flex-shrink-0 ${
                  highlighted ? 'text-green' : 'text-text3 group-hover:text-text2'
                }`}
                strokeWidth={2}
              />
              <span className="truncate">{item.label}</span>
            </span>
            {isPending && (
              <span className="w-3 h-3 rounded-full border-2 border-green border-t-transparent animate-spin flex-shrink-0" />
            )}
          </Link>
        );
      })}
    </>
  );
}

function UserBlock({ user }: { user: SessionUser }) {
  const { signOut } = useClerk();

  return (
    <div className="border-t border-border p-3">
      <div className="flex items-center gap-2 px-2 py-2 mb-2">
        <div className="w-8 h-8 rounded-full bg-surface2 ring-1 ring-inset ring-border flex items-center justify-center text-xs font-semibold text-text2 flex-shrink-0">
          {userInitials(user.fullName)}
        </div>
        <div className="min-w-0 flex-1">
          <div className="text-sm font-medium text-text truncate">{user.fullName}</div>
          <div className="text-xs text-text3 truncate">{user.email}</div>
        </div>
      </div>
      <div className="flex items-center gap-1">
        <ThemeToggle />
        <button
          onClick={() => signOut({ redirectUrl: '/sign-in' })}
          className="flex-1 flex items-center justify-center gap-1.5 px-3 py-1.5 text-xs font-medium text-text2 rounded hover:text-text hover:bg-surface2 transition"
        >
          <LogOut className="w-3.5 h-3.5" strokeWidth={2} />
          Sign out
        </button>
      </div>
    </div>
  );
}

export function Sidebar({ user }: { user: SessionUser }) {
  const pathname = usePathname();
  const [pendingHref, setPendingHref] = useState<string | null>(null);
  const [sidebarOpen, setSidebarOpen] = useState(false);

  // Clear pending state + close drawer on route change
  useEffect(() => {
    setPendingHref(null);
    setSidebarOpen(false);
  }, [pathname]);

  // Lock body scroll when mobile drawer is open
  useEffect(() => {
    if (sidebarOpen) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = '';
    }
    return () => {
      document.body.style.overflow = '';
    };
  }, [sidebarOpen]);

  // Close drawer on Escape key
  useEffect(() => {
    if (!sidebarOpen) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setSidebarOpen(false);
    };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [sidebarOpen]);

  const handleNavigate = (href: string) => {
    if (pathname !== href && !pathname.startsWith(`${href}/`)) {
      setPendingHref(href);
    }
  };

  const brandMark = (
    <div className="flex items-center gap-2">
      <div className="w-7 h-7 rounded-md bg-green/15 ring-1 ring-inset ring-green/30 flex items-center justify-center">
        <Building2 className="w-4 h-4 text-green" strokeWidth={2.25} />
      </div>
      <div className="text-sm font-semibold tracking-tight text-text">SteadyState</div>
    </div>
  );

  return (
    <>
      {/* ── Desktop sidebar (visible ≥768px) ── */}
      <aside className="hidden md:flex w-60 shrink-0 border-r border-border bg-surface flex-col">
        <div className="px-5 py-5 border-b border-border">{brandMark}</div>
        <nav className="flex-1 px-2 py-3 space-y-0.5 overflow-y-auto">
          <NavLinks pendingHref={pendingHref} onNavigate={handleNavigate} />
        </nav>
        <UserBlock user={user} />
      </aside>

      {/* ── Mobile hamburger FAB ── */}
      <button
        onClick={() => setSidebarOpen(true)}
        className="md:hidden fixed top-4 left-4 z-50 p-3 rounded-lg bg-surface border border-border text-text2 hover:text-text hover:bg-surface2 shadow-md transition-colors"
        aria-label="Open menu"
      >
        <Menu className="w-5 h-5" />
      </button>

      {/* ── Mobile overlay backdrop ── */}
      {sidebarOpen && (
        <div
          className="fixed inset-0 bg-black/50 z-40 md:hidden"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      {/* ── Mobile slide-over drawer ── */}
      <aside
        className={`fixed inset-y-0 left-0 z-50 w-72 md:hidden bg-surface border-r border-border flex flex-col shadow-2xl transition-transform duration-200 ease-in-out ${
          sidebarOpen ? 'translate-x-0' : '-translate-x-full'
        }`}
      >
        <div className="flex items-center justify-between px-5 py-5 border-b border-border shrink-0">
          {brandMark}
          <button
            onClick={() => setSidebarOpen(false)}
            className="p-1.5 rounded-md text-text3 hover:text-text hover:bg-surface2 transition-colors"
            aria-label="Close menu"
          >
            <X className="w-5 h-5" />
          </button>
        </div>
        <nav className="flex-1 px-2 py-3 space-y-0.5 overflow-y-auto">
          <NavLinks pendingHref={pendingHref} onNavigate={handleNavigate} />
        </nav>
        <UserBlock user={user} />
      </aside>
    </>
  );
}

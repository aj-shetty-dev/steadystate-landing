'use client';

import { useClerk } from '@clerk/nextjs';
import {
  BarChart3,
  BookOpen,
  Building2,
  CalendarDays,
  CreditCard,
  DoorOpen,
  FileText,
  LayoutDashboard,
  LogOut,
  type LucideIcon,
  MessageSquare,
  Receipt,
  ScanLine,
  ShoppingBag,
  Sparkles,
  Target,
  UserCog,
  Users,
  Wallet,
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
  { href: '/leads',        label: 'Leads',        icon: Target },
  { href: '/checkins',     label: 'Check-ins',    icon: ScanLine },
  { href: '/pos',          label: 'POS',          icon: Receipt },
  { href: '/staff',        label: 'Staff',        icon: UserCog },
  { href: '/shop',         label: 'Shop',         icon: ShoppingBag },
  { href: '/billing',      label: 'Billing',      icon: Wallet },
  { href: '/messages',     label: 'Messages',     icon: MessageSquare },
  { href: '/reports',      label: 'Reports',      icon: BarChart3 },
  { href: '/automation',   label: 'Automation',   icon: Sparkles },
  { href: '/door',         label: 'Door events',  icon: DoorOpen },
  { href: '/subscription', label: 'Subscription', icon: CreditCard },
  { href: '/docs',         label: 'Docs',         icon: BookOpen },
];

function userInitials(fullName: string): string {
  const parts = fullName.trim().split(/\s+/);
  if (parts.length === 0 || !parts[0]) return '?';
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

export function Sidebar({ user }: { user: SessionUser }) {
  const pathname = usePathname();
  const { signOut } = useClerk();
  const [pendingHref, setPendingHref] = useState<string | null>(null);

  useEffect(() => {
    setPendingHref(null);
  }, [pathname]);

  return (
    <aside className="w-60 shrink-0 border-r border-border bg-surface flex flex-col">
      {/* Brand */}
      <div className="px-5 py-5 border-b border-border">
        <div className="flex items-center gap-2">
          <div className="w-7 h-7 rounded-md bg-green/15 ring-1 ring-inset ring-green/30 flex items-center justify-center">
            <Building2 className="w-4 h-4 text-green" strokeWidth={2.25} />
          </div>
          <div className="text-sm font-semibold tracking-tight text-text">SteadyState</div>
        </div>
      </div>

      {/* Nav */}
      <nav className="flex-1 px-2 py-3 space-y-0.5 overflow-y-auto">
        {NAV.map((item) => {
          const isActive = pathname === item.href || pathname.startsWith(`${item.href}/`);
          const isPending = pendingHref === item.href;
          const highlighted = pendingHref ? isPending : isActive;
          const Icon = item.icon;
          return (
            <Link
              key={item.href}
              href={item.href}
              onClick={() => {
                if (!isActive) setPendingHref(item.href);
              }}
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
      </nav>

      {/* User block */}
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
    </aside>
  );
}

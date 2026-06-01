import Link from 'next/link';
import { notFound } from 'next/navigation';
import { CalendarDays, CreditCard, FileText, History, ScanLine } from 'lucide-react';
import { Alert } from '../../../../components/ui/alert';
import { Badge } from '../../../../components/ui/badge';
import { EmptyState } from '../../../../components/ui/empty-state';
import { StatusBadge } from '../../../../components/ui/status-badge';
import {
  apiFetch,
  type CheckinRow,
  type ClassBookingRow,
  type InvoiceRow,
  type MemberDetail,
  type MembershipRow,
  type Paginated,
} from '../../../../lib/api';
import { MemberDetailClient } from './member-detail-client';
import { MembershipActionsClient } from './membership-actions-client';

export const dynamic = 'force-dynamic';

function initials(name: string): string {
  return name
    .split(' ')
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0].toUpperCase())
    .join('');
}

function fmt(d: string | null | undefined): string {
  if (!d) return '—';
  return new Date(d).toLocaleDateString('en-AE', { day: 'numeric', month: 'short', year: 'numeric' });
}

function fmtDateTime(d: string): string {
  return new Date(d).toLocaleString('en-AE', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export default async function MemberProfilePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  const [memberResult, membershipsResult, checkinsResult, invoicesResult, bookingsResult] =
    await Promise.allSettled([
      apiFetch<MemberDetail>(`/members/${id}`),
      apiFetch<Paginated<MembershipRow>>(`/memberships?memberId=${id}`),
      apiFetch<CheckinRow[]>(`/checkins?memberId=${id}`),
      apiFetch<Paginated<InvoiceRow>>(`/billing/invoices?memberId=${id}&pageSize=10`),
      apiFetch<ClassBookingRow[]>(`/classes/bookings?memberId=${id}`),
    ]);

  if (memberResult.status === 'rejected') {
    const err = memberResult.reason as { status?: number; message?: string };
    if (err.status === 404 || err.status === 400) notFound();
    // For network errors (status 0) or server errors, show an error page
    return (
      <div className="space-y-6">
        <Link
          href="/members"
          className="inline-flex items-center gap-1.5 text-sm text-text2 hover:text-text transition-colors"
        >
          ← Members
        </Link>
        <Alert>{err.message ?? 'Failed to load member details. Please try again.'}</Alert>
      </div>
    );
  }

  const member = memberResult.value;
  const emergencyContact = member.emergencyContact as { name?: string; phone?: string } | null | undefined;
  const memberships = membershipsResult.status === 'fulfilled' ? membershipsResult.value.items : null;
  const checkins = checkinsResult.status === 'fulfilled' ? checkinsResult.value.slice(0, 10) : null;
  const invoices = invoicesResult.status === 'fulfilled' ? invoicesResult.value.items : null;
  const bookings = bookingsResult.status === 'fulfilled' ? bookingsResult.value : null;

  // Surface the most relevant membership: prefer ACTIVE, then most recent
  const activeMembership =
    memberships?.find((m) => m.status === 'ACTIVE') ?? memberships?.[0] ?? null;
  const pastMemberships =
    memberships?.filter((m) => m.id !== activeMembership?.id) ?? [];

  // Split bookings: upcoming (session.startsAt >= now and active) vs history
  const now = Date.now();
  const upcomingBookings =
    bookings?.filter(
      (b) =>
        b.session &&
        new Date(b.session.startsAt).getTime() >= now &&
        (b.status === 'BOOKED' || b.status === 'WAITLISTED' || b.status === 'CHECKED_IN'),
    ) ?? [];
  const pastBookings =
    bookings?.filter(
      (b) =>
        !upcomingBookings.includes(b),
    ).slice(0, 10) ?? [];

  return (
    <div className="space-y-6">
      {/* Back link */}
      <Link
        href="/members"
        className="inline-flex items-center gap-1.5 text-sm text-text2 hover:text-text transition-colors"
      >
        ← Members
      </Link>

      {/* Header card */}
      <div className="bg-surface border border-border rounded-lg p-6">
        <div className="flex items-start gap-4">
          <div className="w-12 h-12 shrink-0 rounded-full bg-green/15 ring-1 ring-green/30 flex items-center justify-center text-green font-semibold text-base select-none">
            {initials(member.fullName)}
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="text-xl font-semibold tracking-tight text-text">{member.fullName}</h1>
              <StatusBadge status={member.membershipStatus} />
            </div>
            <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-sm text-text2">
              {member.email && <span>{member.email}</span>}
              {member.phone && <span className="tabular-nums">{member.phone}</span>}
              {member.email && member.phone && <span className="text-border">·</span>}
            </div>
            <div className="mt-2 flex flex-wrap items-center gap-2">
              <Badge tone="neutral">{member.provider.toLowerCase()}</Badge>
              {member.preferredLocale && member.preferredLocale !== 'EN' && (
                <Badge tone="muted">{member.preferredLocale}</Badge>
              )}
              {member.source && member.source !== 'MANUAL' && (
                <Badge tone="muted">{member.source.toLowerCase()}</Badge>
              )}
              <span className="text-xs text-text3">Joined {fmt(member.joinedAt)}</span>
              {member.membershipExpiresAt && (
                <span className="text-xs text-text3">
                  Membership expires {fmt(member.membershipExpiresAt)}
                </span>
              )}
            </div>
            {(emergencyContact || member.assignedTrainerId) && (
              <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-xs text-text2">
                {emergencyContact && (emergencyContact.name || emergencyContact.phone) && (
                  <span>
                    Emergency: {emergencyContact.name || '—'}
                    {emergencyContact.phone && <> · {emergencyContact.phone}</>}
                  </span>
                )}
                {member.assignedTrainerId && (
                  <Badge tone="neutral">Has assigned trainer</Badge>
                )}
              </div>
            )}
          </div>
          <MemberDetailClient member={member} />
        </div>
      </div>

      {/* Membership */}
      <section>
        <h2 className="text-base font-semibold tracking-tight text-text mb-3">Membership</h2>
        {membershipsResult.status === 'rejected' && (
          <Alert>Could not load memberships.</Alert>
        )}
        {membershipsResult.status === 'fulfilled' && !activeMembership && (
          <div className="bg-surface border border-border rounded-lg">
            <EmptyState icon={CreditCard} title="No membership" description="No plan has been assigned to this member yet." />
            <div className="px-6 pb-6">
              <MembershipActionsClient memberId={member.id} membership={null} />
            </div>
          </div>
        )}
        {activeMembership && (
          <div className="bg-surface border border-border rounded-lg p-6">
            <dl className="divide-y divide-border">
              <div className="flex justify-between items-center py-2.5">
                <dt className="text-text2 text-sm">Plan</dt>
                <dd className="text-text font-medium">{activeMembership.plan.nameEn}</dd>
              </div>
              <div className="flex justify-between items-center py-2.5">
                <dt className="text-text2 text-sm">Status</dt>
                <dd><StatusBadge status={activeMembership.status} /></dd>
              </div>
              <div className="flex justify-between items-center py-2.5">
                <dt className="text-text2 text-sm">Start</dt>
                <dd className="text-text tabular-nums">{fmt(activeMembership.startDate)}</dd>
              </div>
              <div className="flex justify-between items-center py-2.5">
                <dt className="text-text2 text-sm">End</dt>
                <dd className="text-text tabular-nums">{fmt(activeMembership.endDate)}</dd>
              </div>
              <div className="flex justify-between items-center py-2.5">
                <dt className="text-text2 text-sm">Price</dt>
                <dd className="text-text tabular-nums">AED {activeMembership.plan.priceAed.toFixed(2)}</dd>
              </div>
            </dl>
            <MembershipActionsClient memberId={member.id} membership={activeMembership} />
          </div>
        )}
      </section>

      {/* Membership history */}
      {pastMemberships.length > 0 && (
        <section>
          <h2 className="text-base font-semibold tracking-tight text-text mb-3 flex items-center gap-2">
            <History className="w-4 h-4 text-text3" />
            Membership history
          </h2>
          <div className="bg-surface border border-border rounded-lg overflow-y-auto flex-1 min-h-0">
            <table className="w-full text-sm">
              <thead className="bg-surface2 text-text3 text-[11px] font-medium uppercase tracking-wider border-b border-border">
                <tr>
                  <th className="text-left px-4 py-3">Plan</th>
                  <th className="text-left px-4 py-3">Status</th>
                  <th className="text-left px-4 py-3">Start</th>
                  <th className="text-left px-4 py-3">End</th>
                  <th className="text-left px-4 py-3">Notes</th>
                </tr>
              </thead>
              <tbody>
                {pastMemberships.map((m) => (
                  <tr key={m.id} className="border-t border-border">
                    <td className="px-4 py-3 text-text">{m.plan.nameEn}</td>
                    <td className="px-4 py-3"><StatusBadge status={m.status} /></td>
                    <td className="px-4 py-3 text-text2 tabular-nums">{fmt(m.startDate)}</td>
                    <td className="px-4 py-3 text-text2 tabular-nums">{fmt(m.endDate)}</td>
                    <td className="px-4 py-3 text-text3 text-xs">{m.cancellationReason ?? '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {/* Class bookings */}
      <section>
        <h2 className="text-base font-semibold tracking-tight text-text mb-3 flex items-center gap-2">
          <CalendarDays className="w-4 h-4 text-text3" />
          Class bookings
        </h2>
        {bookingsResult.status === 'rejected' && <Alert>Could not load class bookings.</Alert>}
        {bookingsResult.status === 'fulfilled' && (
          <div className="space-y-4">
            <div className="bg-surface border border-border rounded-lg overflow-y-auto flex-1 min-h-0">
              <div className="px-4 py-2 bg-surface2/40 border-b border-border">
                <p className="text-xs font-medium text-text3 uppercase tracking-wider">Upcoming ({upcomingBookings.length})</p>
              </div>
              {upcomingBookings.length === 0 ? (
                <EmptyState icon={CalendarDays} title="No upcoming classes" description="This member has no upcoming class bookings." />
              ) : (
                <table className="w-full text-sm">
                  <thead className="bg-surface2 text-text3 text-[11px] font-medium uppercase tracking-wider border-b border-border">
                    <tr>
                      <th className="text-left px-4 py-3">Class</th>
                      <th className="text-left px-4 py-3">When</th>
                      <th className="text-left px-4 py-3">Instructor</th>
                      <th className="text-left px-4 py-3">Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {upcomingBookings.map((b) => (
                      <tr key={b.id} className="border-t border-border hover:bg-surface2/60 transition-colors">
                        <td className="px-4 py-3 text-text font-medium">{b.session?.classType.nameEn ?? '—'}</td>
                        <td className="px-4 py-3 text-text2 tabular-nums">{b.session ? fmtDateTime(b.session.startsAt) : '—'}</td>
                        <td className="px-4 py-3 text-text2">{b.session?.instructor?.fullName ?? '—'}</td>
                        <td className="px-4 py-3">
                          <StatusBadge status={b.status} />
                          {b.position != null && <span className="ml-2 text-xs text-text3">#{b.position}</span>}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>

            {pastBookings.length > 0 && (
              <div className="bg-surface border border-border rounded-lg overflow-y-auto flex-1 min-h-0">
                <div className="px-4 py-2 bg-surface2/40 border-b border-border">
                  <p className="text-xs font-medium text-text3 uppercase tracking-wider">Recent history ({pastBookings.length})</p>
                </div>
                <table className="w-full text-sm">
                  <thead className="bg-surface2 text-text3 text-[11px] font-medium uppercase tracking-wider border-b border-border">
                    <tr>
                      <th className="text-left px-4 py-3">Class</th>
                      <th className="text-left px-4 py-3">When</th>
                      <th className="text-left px-4 py-3">Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {pastBookings.map((b) => (
                      <tr key={b.id} className="border-t border-border">
                        <td className="px-4 py-3 text-text2">{b.session?.classType.nameEn ?? '—'}</td>
                        <td className="px-4 py-3 text-text3 tabular-nums">{b.session ? fmtDateTime(b.session.startsAt) : '—'}</td>
                        <td className="px-4 py-3"><StatusBadge status={b.status} /></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}
      </section>

      {/* Recent check-ins */}
      <section>
        <h2 className="text-base font-semibold tracking-tight text-text mb-3">Recent check-ins</h2>
        {checkinsResult.status === 'rejected' && (
          <Alert>Could not load check-ins.</Alert>
        )}
        {checkinsResult.status === 'fulfilled' && (
          <div className="bg-surface border border-border rounded-lg overflow-y-auto flex-1 min-h-0">
            {checkins!.length === 0 ? (
              <EmptyState icon={ScanLine} title="No check-ins yet" description="This member hasn't checked in." />
            ) : (
              <table className="w-full text-sm">
                <thead className="bg-surface2 text-text3 text-[11px] font-medium uppercase tracking-wider border-b border-border">
                  <tr>
                    <th className="text-left px-4 py-3">Date &amp; Time</th>
                    <th className="text-left px-4 py-3">Source</th>
                  </tr>
                </thead>
                <tbody>
                  {checkins!.map((c) => (
                    <tr key={c.id} className="border-t border-border hover:bg-surface2/60 transition-colors">
                      <td className="px-4 py-3 text-text tabular-nums">{fmtDateTime(c.checkedInAt)}</td>
                      <td className="px-4 py-3 text-text2 capitalize">{c.source.toLowerCase().replace(/_/g, ' ')}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        )}
      </section>

      {/* Invoices */}
      <section>
        <h2 className="text-base font-semibold tracking-tight text-text mb-3">Invoices</h2>
        {invoicesResult.status === 'rejected' && (
          <Alert>Could not load invoices.</Alert>
        )}
        {invoicesResult.status === 'fulfilled' && (
          <div className="bg-surface border border-border rounded-lg overflow-y-auto flex-1 min-h-0">
            {invoices!.length === 0 ? (
              <EmptyState icon={FileText} title="No invoices" description="No invoices have been raised for this member." />
            ) : (
              <table className="w-full text-sm">
                <thead className="bg-surface2 text-text3 text-[11px] font-medium uppercase tracking-wider border-b border-border">
                  <tr>
                    <th className="text-left px-4 py-3">Due</th>
                    <th className="text-left px-4 py-3">Description</th>
                    <th className="text-left px-4 py-3">Amount</th>
                    <th className="text-left px-4 py-3">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {invoices!.map((inv) => (
                    <tr key={inv.id} className="border-t border-border hover:bg-surface2/60 transition-colors">
                      <td className="px-4 py-3 text-text tabular-nums">{fmt(inv.dueDate)}</td>
                      <td className="px-4 py-3 text-text2">{inv.description ?? '—'}</td>
                      <td className="px-4 py-3 text-text font-medium tabular-nums">
                        AED {inv.amountAed.toFixed(2)}
                        {inv.vatAed > 0 && (
                          <span className="text-text3 font-normal"> +{inv.vatAed.toFixed(2)} VAT</span>
                        )}
                      </td>
                      <td className="px-4 py-3"><StatusBadge status={inv.status} /></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        )}
      </section>

      {/* TODO(human): WhatsApp messages section — the messages table stores `to` (phone number)
          rather than a memberId FK. To add this section, either:
          a) JOIN on member.phone in the messages query, or
          b) Add a nullable memberId column to the WhatsAppMessage model in Prisma. */}
    </div>
  );
}

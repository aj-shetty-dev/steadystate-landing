'use client';

import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';
import { StatusBadge } from '../../../components/ui/status-badge';
import type { ClassBookingRow, ClassSessionRow, MemberRow } from '../../../lib/api';

const DAY_NAMES = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

function fmtDateTime(d: string) {
  const dt = new Date(d);
  return `${DAY_NAMES[dt.getDay()]} ${dt.toLocaleDateString('en-AE', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  })} · ${dt.toLocaleTimeString('en-AE', { hour: '2-digit', minute: '2-digit', hour12: true })}`;
}

function fmtTime(d: string) {
  return new Date(d).toLocaleTimeString('en-AE', { hour: '2-digit', minute: '2-digit', hour12: true });
}

interface MembersPage {
  data: MemberRow[];
}

interface Props {
  session: ClassSessionRow;
  onClose: () => void;
  onCancelSession: () => void;
  cancellingSession: boolean;
}

export function SessionDetailModal({ session, onClose, onCancelSession, cancellingSession }: Props) {
  const [bookings, setBookings] = useState<ClassBookingRow[] | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [cancellingBooking, setCancellingBooking] = useState<string | null>(null);
  const [checkingInBooking, setCheckingInBooking] = useState<string | null>(null);
  const [bookingError, setBookingError] = useState<string | null>(null);

  // Book member inline form state
  const [showBookForm, setShowBookForm] = useState(false);
  const [memberSearch, setMemberSearch] = useState('');
  const [memberResults, setMemberResults] = useState<MemberRow[]>([]);
  const [selectedMember, setSelectedMember] = useState<MemberRow | null>(null);
  const [bookingBusy, setBookingBusy] = useState(false);
  const [bookingFormError, setBookingFormError] = useState<string | null>(null);
  const searchDebounce = useRef<ReturnType<typeof setTimeout> | null>(null);

  const capacity = session.capacityOverride ?? session.classType.capacity;
  const activeBookingsCount = bookings?.filter((b) => b.status !== 'CANCELLED').length ?? session._count.bookings;
  const fillPct = capacity > 0 ? Math.round((activeBookingsCount / capacity) * 100) : 0;

  useEffect(() => {
    fetch(`/api/proxy/classes/bookings?sessionId=${session.id}`)
      .then((r) => r.json())
      .then((data: ClassBookingRow[]) => setBookings(data))
      .catch(() => setLoadError('Failed to load bookings'));
  }, [session.id]);

  // Debounced member search
  useEffect(() => {
    if (!showBookForm) return;
    if (searchDebounce.current) clearTimeout(searchDebounce.current);
    if (memberSearch.trim().length < 2) { setMemberResults([]); return; }
    searchDebounce.current = setTimeout(() => {
      fetch(`/api/proxy/members?search=${encodeURIComponent(memberSearch)}&pageSize=20`)
        .then((r) => r.json())
        .then((d: MembersPage | MemberRow[]) => {
          setMemberResults(Array.isArray(d) ? d : (d.data ?? []));
        })
        .catch(() => { /* ignore search errors */ });
    }, 300);
    return () => { if (searchDebounce.current) clearTimeout(searchDebounce.current); };
  }, [memberSearch, showBookForm]);

  async function cancelBooking(bookingId: string) {
    setCancellingBooking(bookingId);
    setBookingError(null);
    try {
      const res = await fetch(`/api/proxy/classes/bookings/${bookingId}/cancel`, { method: 'POST' });
      if (!res.ok) {
        const b = (await res.json().catch(() => ({}))) as { message?: string };
        throw new Error(b.message ?? `Error ${res.status}`);
      }
      setBookings((prev) =>
        prev
          ? prev.map((b) => b.id === bookingId ? { ...b, status: 'CANCELLED', cancelledAt: new Date().toISOString() } : b)
          : prev,
      );
    } catch (err) {
      setBookingError((err as Error).message);
    } finally {
      setCancellingBooking(null);
    }
  }

  async function checkInBooking(bookingId: string) {
    setCheckingInBooking(bookingId);
    setBookingError(null);
    try {
      const res = await fetch(`/api/proxy/classes/bookings/${bookingId}/check-in`, { method: 'POST' });
      if (!res.ok) {
        const b = (await res.json().catch(() => ({}))) as { message?: string };
        throw new Error(b.message ?? `Error ${res.status}`);
      }
      setBookings((prev) =>
        prev
          ? prev.map((b) => b.id === bookingId ? { ...b, status: 'CHECKED_IN', checkedInAt: new Date().toISOString() } : b)
          : prev,
      );
    } catch (err) {
      setBookingError((err as Error).message);
    } finally {
      setCheckingInBooking(null);
    }
  }

  async function bookMember() {
    if (!selectedMember) return;
    setBookingBusy(true);
    setBookingFormError(null);
    try {
      const res = await fetch('/api/proxy/classes/bookings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sessionId: session.id, memberId: selectedMember.id }),
      });
      if (!res.ok) {
        const b = (await res.json().catch(() => ({}))) as { message?: string };
        throw new Error(b.message ?? `Error ${res.status}`);
      }
      const newBooking = (await res.json()) as ClassBookingRow & { member?: ClassBookingRow['member'] };
      const enriched: ClassBookingRow = {
        ...newBooking,
        member:
          newBooking.member ?? {
            id: selectedMember.id,
            fullName: selectedMember.fullName,
            phone: selectedMember.phone,
            membershipStatus: selectedMember.membershipStatus,
          },
      };
      setBookings((prev) => (prev ? [...prev, enriched] : [enriched]));
      setSelectedMember(null);
      setMemberSearch('');
      setMemberResults([]);
      setShowBookForm(false);
    } catch (err) {
      setBookingFormError((err as Error).message);
    } finally {
      setBookingBusy(false);
    }
  }

  const active = bookings?.filter((b) => b.status !== 'CANCELLED') ?? [];
  const cancelled = bookings?.filter((b) => b.status === 'CANCELLED') ?? [];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="bg-surface border border-border rounded-xl shadow-xl w-full max-w-lg max-h-[90vh] flex flex-col">
        {/* Header */}
        <div className="flex items-start justify-between px-6 py-4 border-b border-border flex-shrink-0">
          <div>
            <div className="flex items-center gap-2">
              <div
                className="w-3 h-3 rounded-full flex-shrink-0"
                style={{ backgroundColor: session.classType.color }}
              />
              <h2 className="text-base font-semibold text-text">{session.classType.nameEn}</h2>
              <StatusBadge status={session.status} />
            </div>
            <p className="text-sm text-text2 mt-0.5">
              {fmtDateTime(session.startsAt)}
              {' '}→{' '}
              {fmtTime(session.endsAt)}
            </p>
            {(session.instructor || session.room) && (
              <p className="text-xs text-text3 mt-0.5">
                {session.instructor && <span>Instructor: {session.instructor.fullName}</span>}
                {session.instructor && session.room && <span className="mx-1">·</span>}
                {session.room && <span>Room: {session.room}</span>}
              </p>
            )}
          </div>
          <button onClick={onClose} className="text-text3 hover:text-text transition-colors text-xl leading-none ml-4">
            ×
          </button>
        </div>

        {/* Capacity bar */}
        <div className="px-6 py-3 border-b border-border flex-shrink-0">
          <div className="flex items-center justify-between text-xs text-text2 mb-1">
            <span>
              {activeBookingsCount} / {capacity} spots filled
            </span>
            <span>{fillPct}%</span>
          </div>
          <div className="h-1.5 rounded-full bg-surface2 overflow-hidden">
            <div
              className="h-full rounded-full bg-green transition-all"
              style={{ width: `${Math.min(100, fillPct)}%` }}
            />
          </div>
        </div>

        {/* Bookings list */}
        <div className="overflow-y-auto flex-1 px-6 py-4 space-y-3">
          {bookingError && (
            <div className="rounded-md bg-error/10 text-error text-sm px-4 py-3 ring-1 ring-error/20">
              {bookingError}
            </div>
          )}

          {bookings === null && !loadError && (
            <p className="text-sm text-text3">Loading bookings…</p>
          )}
          {loadError && <p className="text-sm text-error">{loadError}</p>}

          {bookings !== null && active.length === 0 && cancelled.length === 0 && (
            <p className="text-sm text-text3">No bookings yet for this session.</p>
          )}

          {active.length > 0 && (
            <div>
              <p className="text-xs font-medium text-text3 uppercase tracking-wider mb-2">
                Bookings ({active.length})
              </p>
              <div className="space-y-1">
                {active.map((b) => (
                  <div
                    key={b.id}
                    className="flex items-center justify-between py-2 px-3 rounded-lg bg-surface2 gap-2"
                  >
                    <div className="min-w-0">
                      <Link
                        href={`/members/${b.memberId}`}
                        className="text-sm font-medium text-green hover:underline truncate inline-block max-w-full"
                      >
                        {b.member.fullName}
                      </Link>
                      <p className="text-xs text-text3 flex items-center gap-1">
                        <StatusBadge status={b.status} />
                        {b.position != null && <span>· #{b.position} on waitlist</span>}
                        {b.checkedInAt && (
                          <span className="text-green">
                            · checked in {fmtTime(b.checkedInAt)}
                          </span>
                        )}
                      </p>
                    </div>
                    {session.status === 'SCHEDULED' && (
                      <div className="flex items-center gap-1 flex-shrink-0">
                        {b.status === 'BOOKED' && (
                          <button
                            disabled={checkingInBooking === b.id}
                            onClick={() => void checkInBooking(b.id)}
                            className="text-xs text-green hover:text-green/80 disabled:opacity-40 transition-colors border border-green/30 px-2 py-0.5 rounded"
                          >
                            {checkingInBooking === b.id ? '…' : 'Check in'}
                          </button>
                        )}
                        <button
                          disabled={cancellingBooking === b.id}
                          onClick={() => void cancelBooking(b.id)}
                          className="text-xs text-error hover:text-error/80 disabled:opacity-40 transition-colors"
                        >
                          {cancellingBooking === b.id ? 'Cancelling…' : 'Cancel'}
                        </button>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}

          {cancelled.length > 0 && (
            <div>
              <p className="text-xs font-medium text-text3 uppercase tracking-wider mb-2">
                Cancelled ({cancelled.length})
              </p>
              <div className="space-y-1">
                {cancelled.map((b) => (
                  <div
                    key={b.id}
                    className="flex items-center justify-between py-2 px-3 rounded-lg bg-surface2/50 gap-2 opacity-60"
                  >
                    <Link href={`/members/${b.memberId}`} className="text-sm text-text2 hover:text-green hover:underline truncate">
                      {b.member.fullName}
                    </Link>
                    <span className="text-xs text-text3 flex-shrink-0">Cancelled</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Book a member inline form */}
          {session.status === 'SCHEDULED' && bookings !== null && (
            <div className="border-t border-border pt-3">
              {!showBookForm ? (
                <button
                  onClick={() => setShowBookForm(true)}
                  className="text-sm text-green hover:text-green/80 transition-colors font-medium"
                >
                  + Book a member
                </button>
              ) : (
                <div className="space-y-2">
                  <p className="text-xs font-medium text-text2">Book a member</p>
                  {bookingFormError && (
                    <p className="text-xs text-error">{bookingFormError}</p>
                  )}
                  <input
                    type="search"
                    autoFocus
                    placeholder="Search by name, email or phone…"
                    value={memberSearch}
                    onChange={(e) => { setMemberSearch(e.target.value); setSelectedMember(null); }}
                    className="w-full rounded-lg border border-border bg-surface2 px-3 py-2 text-sm text-text placeholder-text3 focus:outline-none focus:ring-2 focus:ring-green/40"
                  />
                  {memberResults.length > 0 && !selectedMember && (
                    <div className="border border-border rounded-lg bg-surface overflow-hidden max-h-48 overflow-y-auto">
                      {memberResults.map((m) => (
                        <button
                          key={m.id}
                          onClick={() => { setSelectedMember(m); setMemberResults([]); }}
                          className="w-full text-left px-3 py-2 text-sm hover:bg-surface2 transition-colors border-b border-border last:border-0"
                        >
                          <span className="font-medium text-text">{m.fullName}</span>
                          {m.phone && <span className="text-text3 ml-2 text-xs">{m.phone}</span>}
                          <span className={`ml-2 text-xs ${m.membershipStatus === 'ACTIVE' ? 'text-green' : 'text-text3'}`}>
                            {m.membershipStatus}
                          </span>
                        </button>
                      ))}
                    </div>
                  )}
                  {selectedMember && (
                    <div className="flex items-center justify-between rounded-lg bg-green/10 px-3 py-2">
                      <span className="text-sm text-text font-medium">{selectedMember.fullName}</span>
                      <button onClick={() => setSelectedMember(null)} className="text-text3 hover:text-text text-xs">
                        ×
                      </button>
                    </div>
                  )}
                  <div className="flex gap-2">
                    <button
                      disabled={!selectedMember || bookingBusy}
                      onClick={() => void bookMember()}
                      className="px-3 py-1.5 rounded-lg bg-green text-white text-xs font-medium hover:bg-green/90 disabled:opacity-40 transition-colors"
                    >
                      {bookingBusy ? 'Booking…' : 'Confirm booking'}
                    </button>
                    <button
                      onClick={() => { setShowBookForm(false); setMemberSearch(''); setSelectedMember(null); setBookingFormError(null); }}
                      className="px-3 py-1.5 rounded-lg border border-border text-xs text-text2 hover:bg-surface2 transition-colors"
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Footer actions */}
        <div className="px-6 py-4 border-t border-border flex-shrink-0 flex items-center justify-between gap-3">
          <div />
          <div className="flex gap-2">
            {session.status === 'SCHEDULED' && (
              <button
                disabled={cancellingSession}
                onClick={onCancelSession}
                className="px-4 py-2 rounded-lg border border-error/30 text-error text-sm font-medium hover:bg-error/5 disabled:opacity-40 transition-colors"
              >
                {cancellingSession ? 'Cancelling…' : 'Cancel session'}
              </button>
            )}
            <button
              onClick={onClose}
              className="px-4 py-2 rounded-lg border border-border text-sm font-medium text-text2 hover:bg-surface2 transition-colors"
            >
              Close
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}


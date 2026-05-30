'use client';

import {
  ArrowRightLeft,
  Calendar,
  CheckCircle,
  MessageSquare,
  Phone,
  Plus,
  RefreshCw,
  Target,
  UserPlus,
  X,
} from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useState } from 'react';
import { EmptyState } from '../../../components/ui/empty-state';
import { PageHeader } from '../../../components/ui/page-header';
import { StatusBadge } from '../../../components/ui/status-badge';
import { KanbanSkeleton } from '../../../components/skeletons/kanban-skeleton';
import type { LeadRow } from '../../../lib/api';
import { apiFetch } from '../../../lib/api';

const STAGES = ['NEW', 'CONTACTED', 'TRIAL_BOOKED', 'TRIAL_COMPLETED', 'CONVERTED', 'LOST'] as const;

const SOURCES = ['WALK_IN', 'REFERRAL', 'INSTAGRAM', 'FACEBOOK', 'GOOGLE', 'WEBSITE', 'WHATSAPP', 'OTHER'] as const;

const ACTIVITY_TYPES = [
  { value: 'CALL', label: 'Call' },
  { value: 'WHATSAPP', label: 'WhatsApp' },
  { value: 'EMAIL', label: 'Email' },
  { value: 'VISIT', label: 'Visit' },
  { value: 'NOTE', label: 'Note' },
] as const;

function fmtDate(d: string | null): string {
  if (!d) return '';
  return new Date(d).toLocaleDateString('en-AE', { day: 'numeric', month: 'short', year: 'numeric' });
}

function fmtDateTime(d: string): string {
  return new Date(d).toLocaleDateString('en-AE', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
}

function timeAgo(d: string): string {
  const diff = Date.now() - new Date(d).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
}

interface Props {
  leads: LeadRow[];
  initialError: string | null;
}

export function LeadsClient({ leads: initialLeads, initialError }: Props) {
  const router = useRouter();
  const [isLoading, setIsLoading] = useState(false);
  const [leads, setLeads] = useState<LeadRow[]>(initialLeads);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => { setIsLoading(false); }, [initialLeads]);

  // Add lead form
  const [showAdd, setShowAdd] = useState(false);
  const [addForm, setAddForm] = useState({ fullName: '', phone: '', email: '', source: 'WALK_IN', notes: '' });
  const [saving, setSaving] = useState(false);

  // Detail panel
  const [detailLead, setDetailLead] = useState<LeadRow | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);

  // Activity logging
  const [activityType, setActivityType] = useState('NOTE');
  const [activitySummary, setActivitySummary] = useState('');
  const [loggingActivity, setLoggingActivity] = useState(false);

  // Convert
  const [converting, setConverting] = useState(false);

  // Follow-up
  const [settingFollowUp, setSettingFollowUp] = useState(false);

  // Drag state
  const [dragLeadId, setDragLeadId] = useState<string | null>(null);
  const [dragOverStage, setDragOverStage] = useState<string | null>(null);

  const displayError = error ?? initialError;

  // Group leads by stage
  const grouped = useCallback(() => {
    const map = new Map<string, LeadRow[]>();
    for (const s of STAGES) map.set(s, []);
    for (const l of leads) map.get(l.stage)?.push(l);
    return map;
  }, [leads]);

  // Reset add form
  function resetAddForm() {
    setAddForm({ fullName: '', phone: '', email: '', source: 'WALK_IN', notes: '' });
  }

  // Add lead
  async function handleAdd() {
    if (!addForm.fullName.trim() || !addForm.phone.trim()) return;
    setSaving(true);
    setError(null);
    try {
      const created = await apiFetch<LeadRow>('/leads', {
        method: 'POST',
        body: JSON.stringify({
          fullName: addForm.fullName.trim(),
          phone: addForm.phone.trim(),
          email: addForm.email.trim() || undefined,
          source: addForm.source,
          notes: addForm.notes.trim() || undefined,
        }),
      });
      setLeads((prev) => [...prev, created]);
      setShowAdd(false);
      resetAddForm();
      setIsLoading(true); router.refresh();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setSaving(false);
    }
  }

  // Drag and drop
  function handleDragStart(e: React.DragEvent, leadId: string) {
    setDragLeadId(leadId);
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/plain', leadId);
  }

  function handleDragOver(e: React.DragEvent, stage: string) {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    setDragOverStage(stage);
  }

  function handleDragLeave() {
    setDragOverStage(null);
  }

  async function handleDrop(e: React.DragEvent, targetStage: string) {
    e.preventDefault();
    setDragOverStage(null);
    const leadId = e.dataTransfer.getData('text/plain') || dragLeadId;
    setDragLeadId(null);
    if (!leadId) return;

    const lead = leads.find((l) => l.id === leadId);
    if (!lead || lead.stage === targetStage) return;

    // Optimistic update
    setLeads((prev) => prev.map((l) => (l.id === leadId ? { ...l, stage: targetStage } : l)));

    try {
      await apiFetch(`/leads/${leadId}`, {
        method: 'PATCH',
        body: JSON.stringify({ stage: targetStage }),
      });
      setIsLoading(true); router.refresh();
    } catch (err) {
      setError((err as Error).message);
    }
  }

  // Open detail panel
  async function openDetail(lead: LeadRow) {
    setDetailLead(lead);
    setDetailLoading(true);
    try {
      const full = await apiFetch<LeadRow>(`/leads/${lead.id}`);
      setDetailLead(full);
    } catch {
      // Use basic lead data
    } finally {
      setDetailLoading(false);
    }
  }

  // Log activity
  async function handleLogActivity() {
    if (!detailLead || !activitySummary.trim()) return;
    setLoggingActivity(true);
    try {
      await apiFetch(`/leads/${detailLead.id}/activities`, {
        method: 'POST',
        body: JSON.stringify({ type: activityType, summary: activitySummary.trim() }),
      });
      setActivitySummary('');
      // Refresh detail
      const updatedLead = await apiFetch<LeadRow>(`/leads/${detailLead.id}`);
      setDetailLead(updatedLead);
      setIsLoading(true); router.refresh();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoggingActivity(false);
    }
  }

  // Convert to member
  async function handleConvert() {
    if (!detailLead) return;
    setConverting(true);
    setError(null);
    try {
      const convertResult = await apiFetch<{ memberId: string }>(`/leads/${detailLead.id}/convert`, {
        method: 'POST',
        body: JSON.stringify({}),
      });
      // Mark as converted locally
      setLeads((prev) =>
        prev.map((l) => (l.id === detailLead.id ? { ...l, stage: 'CONVERTED', convertedMemberId: convertResult.memberId } : l)),
      );
      setDetailLead((prev) => (prev ? { ...prev, stage: 'CONVERTED', convertedMemberId: convertResult.memberId } : null));
      setIsLoading(true); router.refresh();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setConverting(false);
    }
  }

  // Set follow-up
  async function handleSetFollowUp(date: string) {
    if (!detailLead) return;
    setSettingFollowUp(true);
    try {
      await apiFetch(`/leads/${detailLead.id}`, {
        method: 'PATCH',
        body: JSON.stringify({ nextFollowUpAt: date ? new Date(date).toISOString() : null }),
      });
      setDetailLead((prev) => (prev ? { ...prev, nextFollowUpAt: date ? new Date(date).toISOString() : null } : null));
      setLeads((prev) =>
        prev.map((l) => (l.id === detailLead.id ? { ...l, nextFollowUpAt: date ? new Date(date).toISOString() : null } : l)),
      );
      setIsLoading(true); router.refresh();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setSettingFollowUp(false);
    }
  }

  const groupMap = grouped();

  return (
    <div className="space-y-4">
      <PageHeader
        title="Leads"
        description={
          <>
            Pipeline of trial seekers, walk-ins, and converted members.
            <span className="ml-2 tabular-nums text-text">{leads.length} total</span>
          </>
        }
        actions={
          <button
            onClick={() => { resetAddForm(); setShowAdd(true); }}
            className="flex items-center gap-1.5 px-4 py-2 rounded-lg bg-green text-white text-sm font-medium hover:bg-green/90 transition-colors"
          >
            <Plus className="w-4 h-4" />
            Add lead
          </button>
        }
      />

      {displayError && (
        <div className="rounded-md bg-error/10 text-error text-sm px-4 py-3 ring-1 ring-error/20 flex items-center justify-between">
          <span>{displayError}</span>
          <button onClick={() => setError(null)} className="text-error/70 hover:text-error">
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* Kanban board */}
      {isLoading && leads.length === 0 ? (
        <KanbanSkeleton />
      ) : leads.length === 0 ? (
        <div className="bg-surface border border-border rounded-lg">
          <EmptyState
            icon={Target}
            title="No leads yet"
            description="Add your first lead to start building your pipeline."
          />
        </div>
      ) : (
        <div className={`grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-6 gap-3 transition-opacity duration-200 ${isLoading ? 'opacity-50' : ''}`}>
          {STAGES.map((stage) => {
            const list = groupMap.get(stage) ?? [];
            const isOver = dragOverStage === stage;
            return (
              <div
                key={stage}
                onDragOver={(e) => handleDragOver(e, stage)}
                onDragLeave={handleDragLeave}
                onDrop={(e) => void handleDrop(e, stage)}
                className={`bg-surface border rounded-lg transition-colors ${
                  isOver ? 'border-green bg-green/5 ring-2 ring-green/30' : 'border-border'
                }`}
              >
                <div className="px-3 py-2.5 border-b border-border flex justify-between items-center">
                  <StatusBadge status={stage} />
                  <span className="text-xs text-text3 tabular-nums">{list.length}</span>
                </div>
                <div className="divide-y divide-border max-h-[60vh] overflow-y-auto">
                  {list.length === 0 && (
                    <div className="px-3 py-4 text-center text-text3 text-xs">
                      {isOver ? 'Drop here' : 'No leads'}
                    </div>
                  )}
                  {list.map((l) => (
                    <div
                      key={l.id}
                      draggable
                      onDragStart={(e) => handleDragStart(e, l.id)}
                      onClick={() => void openDetail(l)}
                      className={`px-3 py-2.5 hover:bg-surface2/60 transition-colors cursor-pointer group ${
                        dragLeadId === l.id ? 'opacity-40' : ''
                      }`}
                    >
                      <div className="text-text text-sm font-medium truncate">{l.fullName}</div>
                      <div className="text-text2 text-xs tabular-nums mt-0.5 flex items-center gap-1">
                        <Phone className="w-3 h-3" />
                        {l.phone}
                      </div>
                      <div className="text-text3 text-[11px] mt-1.5 flex items-center justify-between">
                        <span>{l.source} · {timeAgo(l.createdAt)}</span>
                        {l.nextFollowUpAt && (
                          <span className="text-orange-500 flex items-center gap-0.5">
                            <Calendar className="w-3 h-3" />
                          </span>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* ── Add Lead Modal ── */}
      {showAdd && (
        <div className="fixed inset-0 z-50 flex items-start justify-center px-4 pt-[5vh]">
          <div className="absolute inset-0 bg-black/40" onClick={() => setShowAdd(false)} />
          <div className="relative z-10 w-full max-w-md rounded-xl border border-border bg-surface shadow-2xl p-6">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-base font-semibold text-text flex items-center gap-2">
                <UserPlus className="w-5 h-5 text-green" />
                Add Lead
              </h3>
              <button onClick={() => setShowAdd(false)} className="text-text3 hover:text-text">
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="space-y-3">
              <div>
                <label className="text-xs font-medium text-text3 block mb-1">Full name *</label>
                <input
                  type="text"
                  value={addForm.fullName}
                  onChange={(e) => setAddForm((d) => ({ ...d, fullName: e.target.value }))}
                  placeholder="Ahmed Al-Rashid"
                  className="w-full px-3 py-2 text-sm rounded-lg border border-border bg-surface2 text-text placeholder-text3 focus:outline-none focus:ring-2 focus:ring-green/40"
                  autoFocus
                  onKeyDown={(e) => { if (e.key === 'Enter') void handleAdd(); }}
                />
              </div>
              <div>
                <label className="text-xs font-medium text-text3 block mb-1">Phone *</label>
                <input
                  type="text"
                  value={addForm.phone}
                  onChange={(e) => setAddForm((d) => ({ ...d, phone: e.target.value }))}
                  placeholder="+971501234567"
                  className="w-full px-3 py-2 text-sm rounded-lg border border-border bg-surface2 text-text placeholder-text3 focus:outline-none focus:ring-2 focus:ring-green/40"
                />
              </div>
              <div>
                <label className="text-xs font-medium text-text3 block mb-1">Email</label>
                <input
                  type="email"
                  value={addForm.email}
                  onChange={(e) => setAddForm((d) => ({ ...d, email: e.target.value }))}
                  placeholder="ahmed@example.com"
                  className="w-full px-3 py-2 text-sm rounded-lg border border-border bg-surface2 text-text placeholder-text3 focus:outline-none focus:ring-2 focus:ring-green/40"
                />
              </div>
              <div>
                <label className="text-xs font-medium text-text3 block mb-1">Source</label>
                <select
                  value={addForm.source}
                  onChange={(e) => setAddForm((d) => ({ ...d, source: e.target.value }))}
                  className="w-full px-3 py-2 text-sm rounded-lg border border-border bg-surface2 text-text focus:outline-none focus:ring-2 focus:ring-green/40"
                >
                  {SOURCES.map((s) => (
                    <option key={s} value={s}>{s}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="text-xs font-medium text-text3 block mb-1">Notes</label>
                <textarea
                  value={addForm.notes}
                  onChange={(e) => setAddForm((d) => ({ ...d, notes: e.target.value }))}
                  placeholder="Any relevant notes..."
                  rows={2}
                  className="w-full px-3 py-2 text-sm rounded-lg border border-border bg-surface2 text-text placeholder-text3 focus:outline-none focus:ring-2 focus:ring-green/40 resize-none"
                />
              </div>
            </div>
            <div className="flex gap-3 justify-end mt-5">
              <button
                onClick={() => setShowAdd(false)}
                className="px-4 py-2 rounded-lg border border-border text-sm text-text2 hover:bg-surface2 transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={() => void handleAdd()}
                disabled={saving || !addForm.fullName.trim() || !addForm.phone.trim()}
                className="flex items-center gap-2 px-4 py-2 rounded-lg bg-green text-white text-sm font-medium hover:bg-green/90 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              >
                {saving ? (
                  <>
                    <RefreshCw className="w-4 h-4 animate-spin" />
                    Adding...
                  </>
                ) : (
                  'Add lead'
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Detail Panel (slide-over) ── */}
      {detailLead && (
        <div className="fixed inset-0 z-50 flex justify-end">
          <div className="absolute inset-0 bg-black/40" onClick={() => setDetailLead(null)} />
          <div className="relative z-10 w-full max-w-md bg-surface border-l border-border shadow-2xl h-full overflow-y-auto">
            {/* Header */}
            <div className="sticky top-0 bg-surface border-b border-border px-5 py-4 flex items-center justify-between z-10">
              <div>
                <h3 className="text-base font-semibold text-text">{detailLead.fullName}</h3>
                <div className="flex items-center gap-2 mt-0.5">
                  <StatusBadge status={detailLead.stage} />
                  <span className="text-xs text-text3">{detailLead.source}</span>
                </div>
              </div>
              <button onClick={() => setDetailLead(null)} className="text-text3 hover:text-text">
                <X className="w-5 h-5" />
              </button>
            </div>

            {detailLoading ? (
              <div className="flex items-center justify-center py-12">
                <RefreshCw className="w-6 h-6 text-text3 animate-spin" />
              </div>
            ) : (
              <div className="p-5 space-y-5">
                {/* Contact info */}
                <div className="space-y-1 text-sm">
                  <div className="flex items-center gap-2 text-text">
                    <Phone className="w-4 h-4 text-text3" />
                    <span className="tabular-nums">{detailLead.phone}</span>
                  </div>
                  {detailLead.email && (
                    <div className="text-text2 pl-6">{detailLead.email}</div>
                  )}
                  <div className="text-text3 text-xs pl-6">
                    Created {fmtDateTime(detailLead.createdAt)}
                  </div>
                </div>

                {/* Notes */}
                {detailLead.notes && (
                  <div className="p-3 rounded-lg bg-surface2 border border-border text-sm text-text2">
                    {detailLead.notes}
                  </div>
                )}

                {/* Follow-up */}
                <div className="space-y-1">
                  <label className="text-xs font-medium text-text3">Follow-up reminder</label>
                  <div className="flex items-center gap-2">
                    <input
                      type="date"
                      value={detailLead.nextFollowUpAt?.slice(0, 10) ?? ''}
                      onChange={(e) => void handleSetFollowUp(e.target.value)}
                      className="flex-1 px-3 py-1.5 text-sm rounded-lg border border-border bg-surface2 text-text focus:outline-none focus:ring-2 focus:ring-green/40"
                    />
                    {detailLead.nextFollowUpAt && (
                      <button
                        onClick={() => void handleSetFollowUp('')}
                        className="text-xs text-text3 hover:text-error transition-colors"
                      >
                        <X className="w-4 h-4" />
                      </button>
                    )}
                    {settingFollowUp && <RefreshCw className="w-4 h-4 text-text3 animate-spin" />}
                  </div>
                  {detailLead.nextFollowUpAt && (
                    <p className="text-xs text-orange-500">
                      Follow up: {fmtDate(detailLead.nextFollowUpAt)}
                    </p>
                  )}
                </div>

                {/* Stage controls */}
                {detailLead.stage !== 'CONVERTED' && detailLead.stage !== 'LOST' && (
                  <div className="border-t border-border pt-4">
                    <button
                      onClick={() => void handleConvert()}
                      disabled={converting}
                      className="w-full flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg bg-green text-white text-sm font-semibold hover:bg-green/90 disabled:opacity-50 transition-colors"
                    >
                      {converting ? (
                        <>
                          <RefreshCw className="w-4 h-4 animate-spin" />
                          Converting...
                        </>
                      ) : (
                        <>
                          <ArrowRightLeft className="w-4 h-4" />
                          Convert to Member
                        </>
                      )}
                    </button>
                  </div>
                )}

                {detailLead.convertedMemberId && (
                  <div className="flex items-center gap-2 text-sm text-green">
                    <CheckCircle className="w-4 h-4" />
                    Converted to member
                  </div>
                )}

                {/* Activity timeline */}
                <div className="border-t border-border pt-4">
                  <h4 className="text-sm font-semibold text-text mb-3">Activity</h4>

                  {/* Log activity form */}
                  <div className="space-y-2 mb-4 p-3 rounded-lg bg-surface2 border border-border">
                    <div className="flex gap-2">
                      <select
                        value={activityType}
                        onChange={(e) => setActivityType(e.target.value)}
                        className="px-2 py-1.5 text-xs rounded-md border border-border bg-surface text-text focus:outline-none focus:ring-2 focus:ring-green/40"
                      >
                        {ACTIVITY_TYPES.map((a) => (
                          <option key={a.value} value={a.value}>{a.label}</option>
                        ))}
                      </select>
                      <input
                        type="text"
                        value={activitySummary}
                        onChange={(e) => setActivitySummary(e.target.value)}
                        placeholder="What happened?"
                        className="flex-1 px-3 py-1.5 text-xs rounded-md border border-border bg-surface text-text placeholder-text3 focus:outline-none focus:ring-2 focus:ring-green/40"
                        onKeyDown={(e) => { if (e.key === 'Enter') void handleLogActivity(); }}
                      />
                      <button
                        onClick={() => void handleLogActivity()}
                        disabled={loggingActivity || !activitySummary.trim()}
                        className="px-3 py-1.5 rounded-md bg-green text-white text-xs font-medium hover:bg-green/90 disabled:opacity-50 transition-colors"
                      >
                        {loggingActivity ? (
                          <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                        ) : (
                          'Log'
                        )}
                      </button>
                    </div>
                  </div>

                  {/* Activity list */}
                  {detailLead.activities && detailLead.activities.length > 0 ? (
                    <div className="space-y-2">
                      {detailLead.activities.map((a) => (
                        <div key={a.id} className="flex gap-3 text-sm">
                          <div className="flex-shrink-0 mt-0.5">
                            {a.type === 'CALL' && <Phone className="w-3.5 h-3.5 text-blue-500" />}
                            {a.type === 'WHATSAPP' && <MessageSquare className="w-3.5 h-3.5 text-green" />}
                            {a.type === 'EMAIL' && <MessageSquare className="w-3.5 h-3.5 text-purple-500" />}
                            {a.type === 'VISIT' && <Target className="w-3.5 h-3.5 text-orange-500" />}
                            {a.type === 'NOTE' && <MessageSquare className="w-3.5 h-3.5 text-text3" />}
                            {a.type === 'STAGE_CHANGE' && <ArrowRightLeft className="w-3.5 h-3.5 text-yellow-500" />}
                          </div>
                          <div className="flex-1 min-w-0">
                            <p className="text-text text-xs">{a.summary}</p>
                            <p className="text-text3 text-[11px]">{timeAgo(a.createdAt)}</p>
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <p className="text-xs text-text3 text-center py-3">No activity recorded yet.</p>
                  )}
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

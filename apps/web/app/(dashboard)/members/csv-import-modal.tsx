'use client';

import { Upload, X } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';

interface PreviewError { row: number; error: string }
interface PreviewRow { fullName: string; phone: string; email?: string }

interface ImportPreview {
  totalRows: number;
  validRows: number;
  errors: PreviewError[];
  toCreate: PreviewRow[];
  toUpdate: Array<{ id: string; row: PreviewRow }>;
  unchanged: number;
}

interface ImportResult extends ImportPreview {
  applied: boolean;
  created: number;
  updated: number;
}

type Step = 'upload' | 'preview' | 'done';

interface Props { onClose: () => void }

const TEMPLATE_CSV = `externalId,fullName,phone,email,membershipStatus
,Ahmed Al-Mansoori,+971501234567,ahmed@example.com,ACTIVE
,Sarah Johnson,+971509876543,,PENDING`;

export function CsvImportModal({ onClose }: Props) {
  const router = useRouter();
  const overlayRef = useRef<HTMLDivElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const [step, setStep] = useState<Step>('upload');
  const [csvText, setCsvText] = useState('');
  const [filename, setFilename] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [preview, setPreview] = useState<ImportPreview | null>(null);
  const [result, setResult] = useState<ImportResult | null>(null);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [onClose]);

  function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setFilename(file.name);
    const reader = new FileReader();
    reader.onload = (ev) => setCsvText((ev.target?.result as string) ?? '');
    reader.readAsText(file);
    e.target.value = '';
  }

  async function handlePreview() {
    if (!csvText.trim()) { setError('Please select or paste a CSV file.'); return; }
    setLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/proxy/importer/members/preview', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ csv: csvText }),
      });
      const data = await res.json() as ImportPreview & { message?: string };
      if (!res.ok) { setError(data.message ?? 'Preview failed'); return; }
      setPreview(data);
      setStep('preview');
    } catch {
      setError('Network error — please try again.');
    } finally {
      setLoading(false);
    }
  }

  async function handleApply() {
    if (!preview) return;
    setLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/proxy/importer/members/apply', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ csv: csvText }),
      });
      const data = await res.json() as ImportResult & { message?: string };
      if (!res.ok) { setError(data.message ?? 'Import failed'); return; }
      setResult(data);
      setStep('done');
      router.refresh();
    } catch {
      setError('Network error — please try again.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <>
      <div
        ref={overlayRef}
        className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm px-4"
        onClick={(e) => { if (e.target === overlayRef.current) onClose(); }}
      >
        <div className="relative w-full max-w-lg bg-surface border border-border rounded-xl shadow-2xl">
          {/* Header */}
          <div className="flex items-center justify-between px-6 py-4 border-b border-border">
            <div>
              <h2 className="text-base font-semibold text-text">Import Members from CSV</h2>
              <p className="text-xs text-text3 mt-0.5">
                {step === 'upload' && 'Upload a CSV file or paste its contents'}
                {step === 'preview' && 'Review what will be changed before applying'}
                {step === 'done' && 'Import complete'}
              </p>
            </div>
            <button
              onClick={onClose}
              className="p-1.5 rounded hover:bg-surface2 text-text3 hover:text-text transition-colors"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          <div className="px-6 py-5 space-y-4">
            {/* ── UPLOAD STEP ── */}
            {step === 'upload' && (
              <>
                {/* Drop zone */}
                <div
                  className="border-2 border-dashed border-border rounded-lg p-6 text-center cursor-pointer hover:border-green/50 hover:bg-green/5 transition-colors"
                  onClick={() => fileRef.current?.click()}
                >
                  <Upload className="w-7 h-7 text-text3 mx-auto mb-2" />
                  {filename ? (
                    <p className="text-sm text-text font-medium">{filename}</p>
                  ) : (
                    <>
                      <p className="text-sm text-text2">Click to select a <strong>.csv</strong> file</p>
                      <p className="text-xs text-text3 mt-0.5">or paste CSV text below</p>
                    </>
                  )}
                  <input
                    ref={fileRef}
                    type="file"
                    accept=".csv,text/csv"
                    className="hidden"
                    onChange={handleFile}
                  />
                </div>

                {/* Paste area */}
                <div>
                  <label className="block text-xs font-medium text-text2 mb-1">
                    Or paste CSV text
                  </label>
                  <textarea
                    rows={5}
                    value={csvText}
                    onChange={(e) => { setCsvText(e.target.value); setFilename(''); }}
                    placeholder={TEMPLATE_CSV}
                    className="w-full rounded-lg border border-border bg-surface2 px-3 py-2 text-xs font-mono text-text placeholder-text3/60 focus:outline-none focus:ring-2 focus:ring-green/40 focus:border-green/60 resize-none transition-colors"
                  />
                </div>

                {/* Column guide */}
                <div className="rounded-lg bg-surface2 border border-border px-4 py-3 text-xs text-text2 space-y-1">
                  <p className="font-medium text-text">Required columns</p>
                  <p><code className="text-green">fullName</code>, <code className="text-green">phone</code> (E.164 e.g. +971…)</p>
                  <p className="font-medium text-text mt-1">Optional columns</p>
                  <p><code className="text-text3">externalId</code>, <code className="text-text3">email</code>, <code className="text-text3">membershipStatus</code>, <code className="text-text3">joinedAt</code></p>
                  <p className="text-text3 mt-1">Existing members matched by phone or externalId will be updated, not duplicated.</p>
                </div>

                {error && (
                  <p className="text-xs text-error rounded-lg bg-error/10 ring-1 ring-error/20 px-3 py-2">{error}</p>
                )}
              </>
            )}

            {/* ── PREVIEW STEP ── */}
            {step === 'preview' && preview && (
              <>
                <div className="grid grid-cols-3 gap-3 text-center">
                  {[
                    { label: 'To create', value: preview.toCreate.length, tone: 'green' },
                    { label: 'To update', value: preview.toUpdate.length, tone: 'neutral' },
                    { label: 'Unchanged', value: preview.unchanged, tone: 'muted' },
                  ].map(({ label, value, tone }) => (
                    <div
                      key={label}
                      className={`rounded-lg border px-3 py-3 ${
                        tone === 'green'
                          ? 'border-green/30 bg-green/5'
                          : 'border-border bg-surface2'
                      }`}
                    >
                      <p className={`text-2xl font-semibold tabular-nums ${tone === 'green' ? 'text-green' : 'text-text'}`}>
                        {value}
                      </p>
                      <p className="text-xs text-text3 mt-0.5">{label}</p>
                    </div>
                  ))}
                </div>

                {preview.errors.length > 0 && (
                  <div className="rounded-lg bg-error/10 ring-1 ring-error/20 px-4 py-3 text-xs space-y-1 max-h-36 overflow-y-auto">
                    <p className="font-medium text-error mb-1">{preview.errors.length} row(s) with errors (skipped)</p>
                    {preview.errors.map((e) => (
                      <p key={e.row} className="text-error/80">Row {e.row}: {e.error}</p>
                    ))}
                  </div>
                )}

                {preview.toCreate.length === 0 && preview.toUpdate.length === 0 && (
                  <p className="text-xs text-text2 text-center">Nothing to import — all rows are either unchanged or have errors.</p>
                )}

                {error && (
                  <p className="text-xs text-error rounded-lg bg-error/10 ring-1 ring-error/20 px-3 py-2">{error}</p>
                )}
              </>
            )}

            {/* ── DONE STEP ── */}
            {step === 'done' && result && (
              <div className="text-center py-4 space-y-3">
                <div className="w-12 h-12 rounded-full bg-green/15 ring-1 ring-green/30 flex items-center justify-center mx-auto">
                  <span className="text-green text-xl font-bold">✓</span>
                </div>
                <p className="text-text font-medium">Import successful</p>
                <p className="text-sm text-text2">
                  {result.created} member{result.created !== 1 ? 's' : ''} created
                  {result.updated > 0 && `, ${result.updated} updated`}.
                </p>
              </div>
            )}
          </div>

          {/* Footer */}
          <div className="flex items-center justify-end gap-3 px-6 py-4 border-t border-border">
            {step === 'upload' && (
              <>
                <button
                  onClick={onClose}
                  className="rounded-lg border border-border px-4 py-2 text-sm text-text2 hover:bg-surface2 transition-colors"
                >
                  Cancel
                </button>
                <button
                  onClick={() => void handlePreview()}
                  disabled={loading || !csvText.trim()}
                  className="rounded-lg bg-green px-4 py-2 text-sm font-medium text-white hover:bg-green/90 disabled:opacity-50 transition-colors"
                >
                  {loading ? 'Analysing…' : 'Preview Import'}
                </button>
              </>
            )}
            {step === 'preview' && (
              <>
                <button
                  onClick={() => { setStep('upload'); setError(null); }}
                  className="rounded-lg border border-border px-4 py-2 text-sm text-text2 hover:bg-surface2 transition-colors"
                >
                  Back
                </button>
                <button
                  onClick={() => void handleApply()}
                  disabled={loading || (preview?.toCreate.length === 0 && preview?.toUpdate.length === 0)}
                  className="rounded-lg bg-green px-4 py-2 text-sm font-medium text-white hover:bg-green/90 disabled:opacity-50 transition-colors"
                >
                  {loading ? 'Importing…' : `Apply Import`}
                </button>
              </>
            )}
            {step === 'done' && (
              <button
                onClick={onClose}
                className="rounded-lg bg-green px-4 py-2 text-sm font-medium text-white hover:bg-green/90 transition-colors"
              >
                Done
              </button>
            )}
          </div>
        </div>
      </div>
    </>
  );
}

'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { ConfirmDialog } from '../../../../components/ui/confirm-dialog';
import type { MemberDetail } from '../../../../lib/api';
import { MemberFormModal } from '../member-form-modal';

export function MemberDetailClient({ member }: { member: MemberDetail }) {
  const router = useRouter();
  const [showEdit, setShowEdit] = useState(false);
  const [deactivating, setDeactivating] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);

  async function handleDeactivate() {
    setDeactivating(true);
    try {
      const res = await fetch(`/api/proxy/members/${member.id}/deactivate`, { method: 'PATCH' });
      if (!res.ok) throw new Error('Failed to deactivate');
      router.refresh();
    } finally {
      setDeactivating(false);
    }
  }

  return (
    <>
      <div className="flex items-center gap-2">
        <button
          onClick={() => setShowEdit(true)}
          className="rounded-lg border border-border px-3 py-1.5 text-sm text-text2 hover:bg-surface2 hover:text-text transition-colors"
        >
          Edit
        </button>
        {member.membershipStatus !== 'CANCELLED' && (
          <button
            onClick={() => setShowConfirm(true)}
            disabled={deactivating}
            className="rounded-lg border border-error/40 px-3 py-1.5 text-sm text-error hover:bg-error/5 disabled:opacity-50 transition-colors"
          >
            {deactivating ? 'Deactivating\u2026' : 'Deactivate'}
          </button>
        )}
      </div>
      {showEdit && <MemberFormModal member={member} onClose={() => setShowEdit(false)} />}
      {showConfirm && (
        <ConfirmDialog
          title="Deactivate member"
          message={`${member.fullName}'s status will be set to Cancelled. You can undo this by editing the member.`}
          confirmLabel="Deactivate"
          destructive
          onConfirm={() => { setShowConfirm(false); void handleDeactivate(); }}
          onCancel={() => setShowConfirm(false)}
        />
      )}
    </>
  );
}

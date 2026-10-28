'use client';

import {useTranslations} from 'next-intl';
import { useState } from 'react';
import { Trash2 } from 'lucide-react';
import { useRouter } from 'next/navigation';

export function SettingsDataActions() {
  const router=useRouter(),t=useTranslations('accountData'),common=useTranslations('common');
  const [confirming, setConfirming] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleDelete = async () => {
    setDeleting(true);
    setError(null);
    try {
      const res = await fetch('/api/users/delete-account', { method: 'DELETE' });
      const data = await res.json() as { deleted?: boolean; message?: string; error?: string };
      if (!res.ok||data.deleted!==true) {
        setError(t('deleteFailed'));
        setDeleting(false);
        return;
      }
      router.push('/');
    } catch {
      setError(t('deleteFailed'));
      setDeleting(false);
    }
  };

  return (
    <div className="pt-4 border-t border-border">
      {!confirming ? (
        <button
          onClick={() => setConfirming(true)}
          className="flex items-center gap-2 text-sm text-destructive hover:underline"
        >
          <Trash2 size={14} />
          {t('confirmDelete')}
        </button>
      ) : (
        <div className="p-4 border border-destructive/30 rounded-xl bg-destructive/5 space-y-3">
          <p className="text-sm font-medium text-destructive">{t('delete')}</p>
          <p className="text-xs text-muted-foreground">
            {t('deleteDescription')}
          </p>
          {error && <p role="alert" className="text-xs text-destructive">{error}</p>}
          <div className="flex gap-3">
            <button
              disabled={deleting} onClick={() => setConfirming(false)}
              className="flex-1 py-2 border border-border rounded-lg text-sm hover:bg-muted transition-colors"
            >
              {common('cancel')}
            </button>
            <button
              onClick={handleDelete}
              disabled={deleting}
              className="flex-1 py-2 bg-destructive text-white rounded-lg text-sm font-medium hover:bg-destructive/90 transition-colors disabled:opacity-60"
            >
              {deleting?common('loading'):t('confirmDelete')}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

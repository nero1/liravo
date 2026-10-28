'use client';

import { useState,useRef } from 'react';
import {useTranslations} from 'next-intl';
import {useRequestIntent} from '@/lib/client/useRequestIntent';
import { useRouter } from 'next/navigation';

interface ReportActionFormProps {
  reportId: string;
  userId:string;
  reportedUserId?: string;
}

type ActionType = 'approve' | 'remove' | 'warn' | 'escalate';

const ACTIONS:ActionType[]=['approve','remove','warn','escalate'];

export function ReportActionForm(props:ReportActionFormProps){return <OwnedReportActionForm key={props.userId+':'+props.reportId} {...props}/>;}
function OwnedReportActionForm({reportId,userId}:ReportActionFormProps){
  const t=useTranslations('reportAction'),common=useTranslations('common'),intent=useRequestIntent(userId),busy=useRef(false);
  const router = useRouter();
  const [action, setAction] = useState<ActionType>('approve');
  const [reason, setReason] = useState('');
  const [loading, setLoading] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();if(busy.current)return;busy.current=true;
    setLoading(true);
    const payload={action,reason:reason.trim()||undefined},scope='report-action:'+reportId;
    setError(null);

    try {
      const res = await fetch(`/api/moderation/reports/${reportId}/action`, {
        method: 'POST',
        headers:{'Content-Type':'application/json',...await intent.durableHeaders(payload,scope)},body:JSON.stringify(payload),
      });

      if (!res.ok) {
        setError(t('failed'));
        return;
      }

      await res.json();intent.complete(scope);setDone(true);
      router.refresh();
    } catch {
      setError(t('failed'));
    } finally {
      busy.current=false;setLoading(false);
    }
  }

  if (done) {
    return (
      <p role="status" className="text-sm text-green-600 font-medium">{t('submitted')}</p>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-2 mt-2">
      <select aria-label={t('action')}
        value={action}
        onChange={(e) => setAction(e.target.value as ActionType)}
        className="text-sm border border-border rounded-md px-2 py-1.5 bg-background"
        disabled={loading}
      >
        {ACTIONS.map((a) => (
          <option key={a} value={a}>{t('actions.'+a)}</option>
        ))}
      </select>

      <textarea
        value={reason}
        onChange={(e) => setReason(e.target.value)}
        placeholder={t('notes')} aria-label={t('notes')}
        rows={2}
        maxLength={1000}
        className="text-sm border border-border rounded-md px-2 py-1.5 bg-background resize-none"
        disabled={loading}
      />

      {error && <p role="alert" className="text-xs text-destructive">{error}</p>}

      <button
        type="submit"
        disabled={loading}
        className="text-sm bg-accent text-accent-foreground rounded-md px-3 py-1.5 font-medium hover:bg-accent/90 disabled:opacity-50 transition-colors"
      >
        {loading?common('submitting'):t('submit')}
      </button>
    </form>
  );
}

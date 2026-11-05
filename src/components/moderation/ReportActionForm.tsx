'use client';

import { useState,useRef,useEffect } from 'react';
import {useTranslations} from 'next-intl';
import {useRequestIntent} from '@/lib/client/useRequestIntent';
import {recoverModerationDecision,validModerationReceipt} from '@/lib/client/moderation-decision';
import type {ModerationAction,ContentReportRow} from '@/types/database';
import { useRouter } from 'next/navigation';

interface ReportActionFormProps {
  reportId: string;
  userId:string;
  allowedActions:ModerationAction[];
  entityType:ContentReportRow['entity_type'];
}

type ActionType = 'approve' | 'remove' | 'warn' | 'escalate';

const ACTIONS:ActionType[]=['approve','remove','warn','escalate'];

export function ReportActionForm(props:ReportActionFormProps){return <OwnedReportActionForm key={props.userId+':'+props.reportId} {...props}/>;}
function OwnedReportActionForm({reportId,userId,allowedActions,entityType}:ReportActionFormProps){
  const t=useTranslations('reportAction'),moderation=useTranslations('moderation'),common=useTranslations('common'),intent=useRequestIntent(userId),busy=useRef(false);
  const router = useRouter();
  const [action, setAction] = useState<ActionType>(allowedActions[0]??'approve');
  const [reason, setReason] = useState('');
  const [loading, setLoading] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(()=>{let active=true;void(async()=>{const headers=await intent.pending('report-action:'+reportId);if(!headers)return;try{await recoverModerationDecision(userId,reportId,headers['Idempotency-Key']);if(active){intent.complete('report-action:'+reportId,headers['Idempotency-Key']);setDone(true);router.refresh();}}catch{}})();return()=>{active=false;};},[userId,reportId]); // eslint-disable-line react-hooks/exhaustive-deps
  async function handleSubmit(e:React.FormEvent){
    e.preventDefault();if(busy.current||!allowedActions.includes(action))return;busy.current=true;setLoading(true);setError(null);
    const payload={action,reason:reason.trim()||undefined},scope='report-action:'+reportId;
    try{
      const headers=await intent.durableHeaders(payload,scope);
      let data;
      try{const response=await fetch(`/api/moderation/reports/${reportId}/action`,{method:'POST',headers:{'Content-Type':'application/json',...headers},body:JSON.stringify(payload)});if(!response.ok)throw Error();data=await response.json();if(!validModerationReceipt(data,userId,reportId))throw Error();}
      catch{data=await recoverModerationDecision(userId,reportId,headers['Idempotency-Key']);}
      const status={approve:'approved',remove:'removed',warn:'warned',escalate:'escalated'}[action];
      if(data.report.status!==status||data.report.moderator_id!==userId||data.report.moderator_note!==(payload.reason??null))throw Error();
      intent.complete(scope,headers['Idempotency-Key']);setDone(true);router.refresh();
    }catch{setError(t('failed'));}finally{busy.current=false;setLoading(false);}
  }

  if (done) {
    return (
      <p role="status" className="text-sm text-green-600 font-medium">{t('submitted')}</p>
    );
  }

  if(!allowedActions.length)return <p className="text-sm text-muted-foreground">{moderation('noActions')}</p>;

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-2 mt-2">
      <select aria-label={t('action')}
        value={action}
        onChange={(e) => setAction(e.target.value as ActionType)}
        className="text-sm border border-border rounded-md px-2 py-1.5 bg-background"
        disabled={loading}
      >
        {ACTIONS.filter(a=>allowedActions.includes(a)).map((a) => (
          <option key={a} value={a}>{a==='remove'&&entityType==='user'?moderation('actions.suspend'):t('actions.'+a)}</option>
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

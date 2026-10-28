'use client';

import { useState,useEffect,useRef,useId } from 'react';
import { Flag, X } from 'lucide-react';
import {useTranslations} from 'next-intl';
import {useRequestIntent} from '@/lib/client/useRequestIntent';
import { cn } from '@/lib/utils';

type ContentType = 'review' | 'quote' | 'profile';

const REASONS=['spam','inappropriate','harassment','other'] as const;

interface ReportButtonProps {
  contentType: ContentType;
  contentId: string;
  userId:string;
}

export function ReportButton(props:ReportButtonProps){return <OwnedReportButton key={props.userId+':'+props.contentType+':'+props.contentId} {...props}/>;}
function OwnedReportButton({contentType,contentId,userId}:ReportButtonProps){
  const t=useTranslations('reportContent'),common=useTranslations('common'),intent=useRequestIntent(userId),busy=useRef(false),dialog=useRef<HTMLDialogElement>(null),titleId=useId(),reasonId=useId(),detailsId=useId();
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState<string>('spam');
  const [details, setDetails] = useState('');
  const [loading, setLoading] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(()=>{if(open)dialog.current?.showModal();else dialog.current?.close();},[open]);

  function handleOpen(){
    if(busy.current)return;
    setOpen(true);
    setSubmitted(false);
    setError(null);
  }

  function handleClose() {
    setOpen(false);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();if(busy.current)return;busy.current=true;
    setLoading(true);
    setError(null);

    const fullReason = details.trim()
      ? `${reason}: ${details.trim()}`
      : reason;

    const payload={content_type:contentType,content_id:contentId,reason:fullReason},scope='report:'+contentType+':'+contentId;
    try {
      const res = await fetch('/api/reports', {
        method: 'POST',
        headers:{'Content-Type':'application/json',...await intent.durableHeaders(payload,scope)},body:JSON.stringify(payload),
      });

      if (!res.ok) {
        setError(t('failed'));
        return;
      }

      const data=await res.json();if(data.ok!==true)throw new Error('Invalid report receipt');intent.complete(scope);setSubmitted(true);
    } catch {
      setError(t('failed'));
    } finally {
      busy.current=false;setLoading(false);
    }
  }

  return (
    <>
      <button
        onClick={handleOpen}
        aria-label={t('title')}
        className="text-muted-foreground hover:text-destructive transition-colors"
      >
        <Flag size={16} />
      </button>

      <dialog ref={dialog} aria-labelledby={titleId} onClose={handleClose} className="bg-transparent p-0 w-full max-w-sm backdrop:bg-black/50" onClick={event=>{if(event.target===event.currentTarget)handleClose();}}>
          <div className="bg-card border border-border rounded-xl p-6 w-full max-w-sm shadow-lg">
            <div className="flex items-center justify-between mb-4">
              <h2 id={titleId} className="font-semibold text-base">{t('title')}</h2>
              <button
                onClick={handleClose} aria-label={common('close')}
                className="text-muted-foreground hover:text-foreground transition-colors"
              >
                <X size={18} />
              </button>
            </div>

            {submitted ? (
              <div className="text-center py-4">
                <p className="font-medium text-green-600">{t('submitted')}</p>
                <p className="text-sm text-muted-foreground mt-1">
                  {t('reviewMessage')}
                </p>
                <button
                  onClick={handleClose}
                  className="mt-4 text-sm text-muted-foreground hover:underline"
                >
                  {common('close')}
                </button>
              </div>
            ) : (
              <form onSubmit={handleSubmit} className="flex flex-col gap-3">
                <div>
                  <label htmlFor={reasonId} className="block text-sm font-medium mb-1">{t('reason')}</label>
                  <select id={reasonId}
                    value={reason}
                    onChange={(e) => setReason(e.target.value)}
                    className="w-full border border-border rounded-md px-2 py-1.5 text-sm bg-background"
                    disabled={loading}
                  >
                    {REASONS.map((r) => (
                      <option key={r} value={r}>
                        {t('reasons.'+r)}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label htmlFor={detailsId} className="block text-sm font-medium mb-1">
                    {t('details')}
                  </label>
                  <textarea id={detailsId}
                    value={details}
                    onChange={(e) => setDetails(e.target.value)}
                    rows={3}
                    maxLength={400}
                    placeholder={t('placeholder')}
                    className={cn(
                      'w-full border border-border rounded-md px-2 py-1.5 text-sm bg-background resize-none'
                    )}
                    disabled={loading}
                  />
                </div>

                {error && <p role="alert" className="text-xs text-destructive">{error}</p>}

                <button
                  type="submit"
                  disabled={loading}
                  className="bg-destructive text-destructive-foreground rounded-md px-4 py-2 text-sm font-medium hover:opacity-90 disabled:opacity-50 transition-colors"
                >
                  {loading?common('submitting'):t('submit')}
                </button>
              </form>
            )}
          </div>
      </dialog>
    </>
  );
}

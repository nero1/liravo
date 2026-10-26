'use client';

import { useEffect, useState, useRef } from 'react';
import { useTranslations, useFormatter } from 'next-intl';

interface Payout {legacy:boolean;id:string;user_id:string;amount:string;currency:string;method:string;status:string;destination:{display_name:string;account_number:string;bank_code:string}|null;last_error:string|null;}
export function PayoutQueue(){
  const t=useTranslations('earnings');const formatter=useFormatter();const busy=useRef(false);
  const [rows,setRows]=useState<Payout[]>([]);const [loading,setLoading]=useState(true);const [error,setError]=useState(false);const [pending,setPending]=useState<string|null>(null);const [next,setNext]=useState<string|null>(null);
  async function load(cursor?:string){
    setLoading(true);setError(false);
    try{const response=await fetch(`/api/admin/payouts${cursor?'?cursor='+encodeURIComponent(cursor):''}`);const data=await response.json();if(!response.ok||!Array.isArray(data.payouts))throw new Error('Queue unavailable');setRows(data.payouts);setNext(data.nextCursor);}
    catch{setError(true);}finally{setLoading(false);}
  }
  useEffect(()=>{void load();},[]);
  async function process(id:string,receipt?:string,action='settle'){
    if(busy.current)return;busy.current=true;setPending(id);setError(false);
    const payout=rows.find(row=>row.id===id)!;
    try{
      const response=await fetch(`/api/admin/payouts/${id}/process`,{method:'POST',...(receipt?{headers:{'Content-Type':'application/json'},body:JSON.stringify({settlementReference:receipt,action,amount:payout.amount,currency:payout.currency})}:{})});
      if(!response.ok)throw new Error('Settlement unavailable');await load();
    }catch{setError(true);}finally{busy.current=false;setPending(null);}
  }
  return <section className="mt-8 space-y-4" aria-labelledby="payout-queue-heading">
    <div className="flex items-center justify-between"><h2 id="payout-queue-heading" className="text-lg font-semibold">{t('queueTitle')}</h2><button disabled={loading||!!pending} onClick={()=>load()} className="underline disabled:opacity-50">{t('refresh')}</button></div>
    {loading&&<p role="status">{t('loading')}</p>}{error&&<p role="alert">{t('processUnavailable')}</p>}
    {!loading&&!error&&!rows.length&&<p>{t('queueEmpty')}</p>}
    {rows.map(payout=><article key={payout.id} className="rounded-xl border border-border p-4 space-y-3">
      <p className="font-semibold">{formatter.number(Number(payout.amount),{style:'currency',currency:payout.currency})} · {t(`statuses.${payout.status}`)}</p>
      <p className="text-sm break-all">{payout.user_id}</p>
      {payout.destination&&<details><summary>{t('destination')}</summary><dl className="text-sm space-y-1">{(['display_name','account_number','bank_code'] as const).map(key=><div key={key}><dt>{t(key==='display_name'?'name':key==='account_number'?'account':'bank')}</dt><dd className="break-all">{payout.destination![key]}</dd></div>)}</dl></details>}
      {payout.last_error&&<p role="status" className="text-sm">{t('confirmationPending')}</p>}
      {payout.status==='pending'||payout.method==='paystack'?<button onClick={()=>process(payout.id)} disabled={!!pending} className="px-3 py-2 border border-border rounded disabled:opacity-50">{pending===payout.id?t('submitting'):t(payout.method==='manual'?'beginManual':'verifyTransfer')}</button>:<form onSubmit={event=>{event.preventDefault();const form=new FormData(event.currentTarget);void process(payout.id,String(form.get('reference')),String(form.get('action')??'settle'));}} className="space-y-3">
        <p className="text-sm">{t(payout.legacy?'legacyInstructions':'manualInstructions')}</p>
        {payout.legacy&&<label className="block text-sm" htmlFor={`legacy-action-${payout.id}`}>{t('reconciliationResult')}<select id={`legacy-action-${payout.id}`} name="action" disabled={!!pending} className="block border border-border rounded p-2 bg-background"><option value="settle">{t('confirmedPaid')}</option><option value="releaseLegacy">{t('confirmedUnpaid')}</option></select></label>}
        <label htmlFor={`receipt-${payout.id}`} className="block text-sm">{t('reference')}<input id={`receipt-${payout.id}`} name="reference" required minLength={4} maxLength={200} disabled={!!pending} className="block w-full border border-border rounded p-2 bg-background"/></label>
        <label className="flex gap-2 items-start"><input type="checkbox" required disabled={!!pending}/><span>{t(payout.legacy?'legacyVerified':'receiptVerified')}</span></label>
        <button disabled={!!pending} className="px-3 py-2 border border-border rounded disabled:opacity-50">{pending===payout.id?t('submitting'):t('confirmPaid')}</button>
      </form>}
    </article>)}
    {next&&<button disabled={loading||!!pending} className="underline" onClick={()=>load(next)}>{t('next')}</button>}
  </section>;
}

'use client';

import { useRef, useState } from 'react';
import { useTranslations, useFormatter } from 'next-intl';
import { useRouter } from 'next/navigation';
import { useRequestIntent } from '@/lib/client/useRequestIntent';

export function PayoutForm({currency,available}:{currency:'USD'|'NGN'|'EUR';available:string}) {
  const t=useTranslations('earnings');const formatter=useFormatter();const router=useRouter();const intent=useRequestIntent();
  const busy=useRef(false);const [pending,setPending]=useState(false);const [message,setMessage]=useState<'saved'|'requested'|'failed'|null>(null);
  const [method,setMethod]=useState<'manual'|'paystack'>(currency==='NGN'?'paystack':'manual');
  async function submit(event:React.FormEvent<HTMLFormElement>,destination:boolean) {
    event.preventDefault();if(busy.current)return;busy.current=true;setPending(true);setMessage(null);
    const form=new FormData(event.currentTarget);
    const payload=destination?{provider:method,currency,display_name:form.get('name'),account_number:form.get('account'),bank_code:form.get('bank')}:{amount:form.get('amount'),method,currency};
    try {
      const response=await fetch(destination?'/api/earnings/payout-method':'/api/earnings/request-payout',{method:destination?'PUT':'POST',headers:{'Content-Type':'application/json',...(!destination?intent.headers(payload):{})},body:JSON.stringify(payload)});
      const result=await response.json();
      if(!response.ok || !(destination?result.saved:result.requested))throw new Error('Payout unavailable');
      if(!destination)intent.complete();
      setMessage(destination?'saved':'requested');router.refresh();
    }catch {setMessage('failed');}finally{busy.current=false;setPending(false);}
  }
  const field='block w-full mt-1 p-2 rounded border border-border bg-background';
  return <section className="space-y-4" aria-labelledby="payout-heading">
    <h2 id="payout-heading" className="font-semibold text-lg">{t('request')}</h2>
    <p className="text-sm text-muted-foreground">{t('terms',{minimum:formatter.number(5,{style:'currency',currency})})}</p>
    <label className="block text-sm" htmlFor="payout-method">{t('method')}
      <select id="payout-method" className={field} value={method} disabled={pending} onChange={event=>setMethod(event.target.value as typeof method)}>
        <option value="manual">{t('manual')}</option>{currency==='NGN'&&<option value="paystack">{t('paystack')}</option>}
      </select>
    </label>
    <form onSubmit={event=>submit(event,true)} className="space-y-3 rounded-xl border border-border p-4">
      <h3 className="font-semibold">{t('destination')}</h3>
      <label className="block text-sm" htmlFor="payout-name">{t('name')}<input id="payout-name" name="name" autoComplete="name" required minLength={2} maxLength={100} disabled={pending} className={field}/></label>
      <label className="block text-sm" htmlFor="payout-account">{t('account')}<input id="payout-account" name="account" autoComplete="off" required minLength={4} maxLength={80} disabled={pending} className={field}/></label>
      <label className="block text-sm" htmlFor="payout-bank">{t('bank')}<input id="payout-bank" name="bank" autoComplete="off" required minLength={2} maxLength={40} disabled={pending} className={field}/></label>
      <button disabled={pending} className="px-4 py-2 border border-border rounded-lg disabled:opacity-50">{t('save')}</button>
    </form>
    <form onSubmit={event=>submit(event,false)} className="space-y-3">
      <label htmlFor="payout-amount" className="block text-sm">{t('amount')} ({currency})<input id="payout-amount" name="amount" type="number" inputMode="decimal" min="5" max={Math.min(10000,Math.max(0,Number(available)))} step="0.01" required disabled={pending} className={field}/></label>
      <button disabled={pending||Number(available)<5} className="px-4 py-2 bg-accent text-accent-foreground rounded-lg disabled:opacity-50">{pending?t('submitting'):t('request')}</button>
    </form>
    {message&&<p role={message==='failed'?'alert':'status'}>{t(message)}</p>}
  </section>;
}

export function CancelPayoutButton({id}:{id:string}) {
  const t=useTranslations('earnings');const router=useRouter();const busy=useRef(false);const [pending,setPending]=useState(false);const [error,setError]=useState(false);
  async function cancel(){
    if(busy.current)return;busy.current=true;setPending(true);setError(false);
    try{const response=await fetch(`/api/earnings/payouts/${id}`,{method:'DELETE'});if(!response.ok)throw new Error('Cancellation unavailable');router.refresh();}
    catch{setError(true);}finally{busy.current=false;setPending(false);}
  }
  return <><button onClick={cancel} disabled={pending} className="block underline mt-1 disabled:opacity-50">{t('cancel')}</button>{error&&<p role="alert">{t('cancelFailed')}</p>}</>;
}

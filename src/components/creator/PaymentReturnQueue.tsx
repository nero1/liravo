'use client';
import { useEffect,useRef,useState } from 'react';
import { useTranslations,useFormatter } from 'next-intl';

interface Return {provider:string;payment_id:string;status:string;currency:string;charged_minor:string;refunded_minor:string;provider_refund_id:string|null;}
export function PaymentReturnQueue(){
  const t=useTranslations('events'),format=useFormatter(),busy=useRef(false);
  const [rows,setRows]=useState<Return[]>([]),[loading,setLoading]=useState(true),[error,setError]=useState(false),[pending,setPending]=useState<string|null>(null);
  async function load(){
    setLoading(true);setError(false);
    try{const response=await fetch('/api/admin/payment-returns'),data=await response.json();if(!response.ok||!Array.isArray(data.returns))throw new Error('Queue unavailable');setRows(data.returns);}
    catch{setError(true);}finally{setLoading(false);}
  }
  useEffect(()=>{void load();},[]);
  async function verify(row:Return,refundId:string){
    if(busy.current)return;busy.current=true;setPending(row.provider+row.payment_id);setError(false);
    try{
      const response=await fetch('/api/admin/payment-returns',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({provider:row.provider,payment_id:row.payment_id,refund_id:refundId})});
      if(!response.ok)throw new Error('Reconciliation unavailable');await load();
    }catch{setError(true);}finally{busy.current=false;setPending(null);}
  }
  return <section className="mt-8 space-y-4" aria-labelledby="payment-return-title">
    <div className="flex items-center justify-between"><h2 id="payment-return-title" className="text-lg font-semibold">{t('returnsTitle')}</h2><button className="underline" disabled={loading||!!pending} onClick={()=>void load()}>{t('refresh')}</button></div>
    <p className="text-sm">{t('returnsHelp')}</p>
    {loading&&<p role="status">{t('loading')}</p>}{error&&<p role="alert">{t('returnVerificationFailed')}</p>}
    {!loading&&!error&&!rows.length&&<p>{t('returnsEmpty')}</p>}
    {rows.map(row=><article key={row.provider+row.payment_id} className="border border-border rounded-xl p-4 space-y-3">
      <p className="font-semibold">{format.number((Number(row.charged_minor)-Number(row.refunded_minor))/100,{style:'currency',currency:row.currency})} · {t(`return_${row.status}`)}</p>
      <p className="text-sm break-all">{row.provider} · {row.payment_id}</p>
      <form className="space-y-2" onSubmit={event=>{event.preventDefault();void verify(row,String(new FormData(event.currentTarget).get('refund_id')));}}>
        <label className="block text-sm">{t('providerRefundId')}<input name="refund_id" required maxLength={150} defaultValue={row.provider_refund_id??''} disabled={!!pending} className="block w-full rounded border border-border p-2 bg-background"/></label>
        <button disabled={!!pending} className="rounded border border-border px-3 py-2">{t('verifyRefund')}</button>
      </form>
    </article>)}
  </section>;
}

'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';

export default function NewEventPage(){
  const router=useRouter(),t=useTranslations('events');
  const [pending,setPending]=useState(false),[error,setError]=useState(false);
  const [form,setForm]=useState({title:'',description:'',event_date:'',is_paid:false,price:'',currency:'USD',book_id:'',max_attendees:''});
  async function submit(event:React.FormEvent){
    event.preventDefault();if(pending)return;setPending(true);setError(false);
    try{
      const date=new Date(form.event_date);if(!Number.isFinite(date.getTime())||date.getTime()<=Date.now())throw new Error('Invalid date');
      const payload={title:form.title,description:form.description,event_date:date.toISOString(),is_paid:form.is_paid,currency:form.currency,...(form.is_paid?{price:Number(form.price)}:{}),...(form.book_id?{book_id:form.book_id}:{}),...(form.max_attendees?{max_attendees:Number(form.max_attendees)}:{})};
      const response=await fetch('/api/events',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(payload)});
      if(!response.ok)throw new Error('Creation unavailable');const data=await response.json();router.push(`/events/${data.event.id}`);
    }catch{setError(true);}finally{setPending(false);}
  }
  const input='block w-full rounded-lg border border-border bg-background px-3 py-2 mt-1';
  return <div className="max-w-xl mx-auto px-4 py-8"><h1 className="font-display text-2xl font-bold mb-6">{t('createEvent')}</h1>
    <form onSubmit={submit} className="space-y-5" aria-busy={pending}>
      <label className="block">{t('eventTitle')}<input required maxLength={200} value={form.title} onChange={event=>setForm({...form,title:event.target.value})} className={input}/></label>
      <label className="block">{t('description')}<textarea required rows={5} maxLength={5000} value={form.description} onChange={event=>setForm({...form,description:event.target.value})} className={input}/></label>
      <label className="block">{t('eventDate')}<input type="datetime-local" required value={form.event_date} onChange={event=>setForm({...form,event_date:event.target.value})} className={input}/></label>
      <label className="flex gap-2"><input type="checkbox" checked={form.is_paid} onChange={event=>setForm({...form,is_paid:event.target.checked})}/>{t('paidEvent')}</label>
      {form.is_paid&&<><label className="block">{t('ticketPrice')}<input type="number" required min={0.5} max={5000} step={0.01} value={form.price} onChange={event=>setForm({...form,price:event.target.value})} className={input}/></label><label className="block">{t('currency')}<select value={form.currency} onChange={event=>setForm({...form,currency:event.target.value})} className={input}>{['USD','NGN','EUR'].map(currency=><option key={currency}>{currency}</option>)}</select></label></>}
      <label className="block">{t('bookId')}<input value={form.book_id} onChange={event=>setForm({...form,book_id:event.target.value})} className={input}/></label>
      <label className="block">{t('maxAttendees')}<input type="number" min={1} step={1} value={form.max_attendees} onChange={event=>setForm({...form,max_attendees:event.target.value})} className={input}/></label>
      {error&&<p role="alert">{t('createFailed')}</p>}
      <button disabled={pending} className="w-full rounded-lg bg-accent text-white py-3 disabled:opacity-50">{pending?t('creating'):t('createEvent')}</button>
    </form>
  </div>;
}

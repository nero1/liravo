'use client';

import {useState} from 'react';
import {useTranslations} from 'next-intl';
import {useRouter} from 'next/navigation';
import Link from 'next/link';

type SeasonalEvent={id:string;name:string;theme:string|null;start_date:string;end_date:string;badge_name:string|null;is_published:boolean};
export function SeasonalEventForm({event}:{event?:SeasonalEvent}){
  const t=useTranslations('admin'),router=useRouter();
  const [form,setForm]=useState({name:event?.name??'',theme:event?.theme??'',start_date:event?.start_date.slice(0,16)??'',end_date:event?.end_date.slice(0,16)??'',badge_name:event?.badge_name??'',is_published:event?.is_published??false});
  const [saving,setSaving]=useState(false),[error,setError]=useState(false);
  async function save(e:React.FormEvent){
    e.preventDefault();if(saving)return;setSaving(true);setError(false);
    try{
      const body={...form,theme:form.theme||null,badge_name:form.badge_name||null,start_date:new Date(form.start_date+':00Z').toISOString(),end_date:new Date(form.end_date+':00Z').toISOString(),...(event?{id:event.id}:{})};
      const response=await fetch('/api/admin/seasonal-events',{method:event?'PATCH':'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});
      if(!response.ok)throw new Error('Event unavailable');await response.json();router.push('/admin/seasonal-events');router.refresh();
    }catch{setError(true);}finally{setSaving(false);}
  }
  const field=(name:'name'|'theme'|'start_date'|'end_date'|'badge_name',label:string,max?:number)=><label htmlFor={`season-${name}`} className="block text-sm space-y-1"><span>{label}</span><input id={`season-${name}`} type={name.endsWith('_date')?'datetime-local':'text'} value={form[name]} required={['name','start_date','end_date'].includes(name)} maxLength={max} onChange={e=>setForm(previous=>({...previous,[name]:e.target.value}))} className="block w-full px-3 py-2 rounded-lg border border-border bg-background"/></label>;
  return <div className="max-w-2xl mx-auto px-4 py-6 space-y-4">
    <Link href="/admin/seasonal-events" className="underline text-sm">{t('seasonalEvents')}</Link>
    <h1 className="font-display text-2xl font-bold">{t(event?'editSeasonalEvent':'newEvent')}</h1>
    {error&&<p role="alert" className="text-destructive">{t('eventSaveFailed')}</p>}
    <form onSubmit={save} aria-busy={saving}>
      <fieldset disabled={saving} className="space-y-4">
        {field('name',t('eventNameLabel'),100)}{field('theme',t('theme'),500)}
        {field('start_date',t('eventStartUtc'))}{field('end_date',t('eventEndUtc'))}
        {field('badge_name',t('eventBadgeLabel'),100)}
        <label className="flex items-center gap-2"><input type="checkbox" checked={form.is_published} onChange={e=>setForm(previous=>({...previous,is_published:e.target.checked}))}/>{t('eventPublished')}</label>
        <button className="px-4 py-2 rounded-lg bg-accent text-accent-foreground disabled:opacity-50" disabled={saving}>{t(saving?'saving':'saveEvent')}</button>
      </fieldset>
    </form>
  </div>;
}

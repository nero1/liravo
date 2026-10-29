'use client';
import {useState} from 'react';
import {useRouter} from 'next/navigation';
import {useTranslations} from 'next-intl';
import {useRequestIntent} from '@/lib/client/useRequestIntent';
import {AuthorBookSelect,useAuthorBooks} from '@/components/author/AuthorBookSelect';
export default function NewArcPage(){
  const router=useRouter(),t=useTranslations('authorCatalog'),common=useTranslations('common'),catalog=useAuthorBooks(),intent=useRequestIntent(catalog.data?.actorId),[pending,setPending]=useState(false),[failed,setFailed]=useState(false),[form,setForm]=useState({book_id:'',description:'',reader_slots:5,close_date:''});
  async function submit(event:React.FormEvent){
    event.preventDefault();if(pending||!catalog.data)return;setPending(true);setFailed(false);
    try{const body={book_id:form.book_id,description:form.description.trim(),reader_slots:form.reader_slots,...(form.close_date?{close_date:new Date(form.close_date).toISOString()}:{})},response=await fetch('/api/author/arcs',{method:'POST',headers:{'Content-Type':'application/json',...await intent.durableHeaders(body,'author.arc')},body:JSON.stringify(body)}),receipt=await response.json();if(!response.ok||!receipt.arc?.id||receipt.arc.author_id!==catalog.data.actorId)throw Error();intent.complete('author.arc');router.push('/author/arcs');router.refresh();}catch{setFailed(true);}finally{setPending(false);}
  }
  return <div className="max-w-xl mx-auto px-4 py-8"><h1 className="font-display text-2xl font-bold mb-2">{t('createArc')}</h1><p className="text-muted-foreground mb-6 text-sm">{t('arcDescription')}</p><form onSubmit={submit} className="space-y-5"><fieldset disabled={pending} className="space-y-5">
    <AuthorBookSelect catalog={catalog} value={form.book_id} onChange={book_id=>setForm({...form,book_id})} required/>
    <label htmlFor="arc-description" className="block text-sm font-medium">{t('description')}<textarea id="arc-description" required rows={4} minLength={1} maxLength={1000} value={form.description} onChange={event=>setForm({...form,description:event.target.value})} className="block w-full rounded-lg border bg-background px-3 py-2 mt-1"/></label>
    <label htmlFor="arc-slots" className="block text-sm font-medium">{t('slots')}<input id="arc-slots" required type="number" min={1} max={20} value={form.reader_slots} onChange={event=>setForm({...form,reader_slots:Number(event.target.value)})} className="block w-full rounded-lg border bg-background px-3 py-2 mt-1"/></label>
    <label htmlFor="arc-close" className="block text-sm font-medium">{t('closeDate')}<input id="arc-close" type="date" value={form.close_date} onChange={event=>setForm({...form,close_date:event.target.value})} className="block w-full rounded-lg border bg-background px-3 py-2 mt-1"/></label>
    </fieldset>{failed&&<p role="alert" className="text-sm text-destructive">{t('saveFailed')}</p>}<button type="submit" disabled={pending||catalog.loading||catalog.failed||!catalog.data||!form.book_id||!form.description.trim()} className="w-full px-4 py-2 rounded-lg bg-accent text-white font-semibold disabled:opacity-50">{pending?common('saving'):t('createArc')}</button></form></div>;
}

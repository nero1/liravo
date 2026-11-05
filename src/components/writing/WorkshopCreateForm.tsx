'use client';
import {useState} from 'react';
import {useRouter} from 'next/navigation';
import {useTranslations} from 'next-intl';
import {useRequestIntent} from '@/lib/client/useRequestIntent';

export function WorkshopCreateForm({actorId}:{actorId:string}){
  const t=useTranslations('nativeWriting'),common=useTranslations('common'),intent=useRequestIntent(actorId),router=useRouter(),[name,setName]=useState(''),[topic,setTopic]=useState(''),[capacity,setCapacity]=useState(5),[saving,setSaving]=useState(false),[failed,setFailed]=useState(false),[saved,setSaved]=useState(false);
  async function create(event:React.FormEvent){
    event.preventDefault();if(saving)return;setSaving(true);setFailed(false);setSaved(false);
    const body={name:name.trim(),topic:topic.trim(),max_members:capacity};
    try{
      const response=await fetch('/api/write/workshops',{method:'POST',headers:{'Content-Type':'application/json',...await intent.durableHeaders(body,'workshop.create')},body:JSON.stringify(body)}),data=await response.json();
      if(response.status===409)router.refresh();
      if(!response.ok||!data.room?.id||data.room.facilitator_id!==actorId)throw Error('Invalid workshop receipt');
      intent.complete('workshop.create');setName('');setTopic('');setSaved(true);router.push('/write/workshops');router.refresh();
    }catch{setFailed(true);}finally{setSaving(false);}
  }
  return <details className="rounded-xl border bg-card p-4"><summary className="cursor-pointer text-sm font-medium">{t('createWorkshop')}</summary><form onSubmit={create} className="mt-4 space-y-3" aria-busy={saving}>
    <fieldset disabled={saving} className="space-y-3">
      <label className="block text-sm" htmlFor="workshop-name">{t('roomName')}<input id="workshop-name" name="name" required minLength={3} maxLength={100} value={name} onChange={event=>setName(event.target.value)} className="w-full rounded-lg border bg-background px-3 py-2 text-sm mt-1"/></label>
      <label className="block text-sm" htmlFor="workshop-topic">{t('topic')}<input id="workshop-topic" name="topic" maxLength={200} value={topic} onChange={event=>setTopic(event.target.value)} className="w-full rounded-lg border bg-background px-3 py-2 text-sm mt-1"/></label>
      <label className="block text-sm" htmlFor="workshop-capacity">{t('capacity')}<input id="workshop-capacity" name="max_members" type="number" min={3} max={8} required value={capacity} onChange={event=>setCapacity(Number(event.target.value))} className="w-20 rounded-lg border bg-background px-3 py-2 text-sm ml-2"/></label>
    </fieldset>
    {failed&&<p role="alert" className="text-sm text-destructive">{t('createFailed')}</p>}{saved&&<p role="status" className="text-sm text-green-600">{t('createdWorkshop')}</p>}
    <button type="submit" disabled={saving||name.trim().length<3||!Number.isInteger(capacity)||capacity<3||capacity>8} className="rounded-lg bg-amber-600 hover:bg-amber-700 disabled:opacity-50 text-white text-sm font-medium px-4 py-2">{saving?common('saving'):t('createWorkshop')}</button>
  </form></details>;
}

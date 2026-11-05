'use client';
import {useCallback,useEffect,useRef,useState} from 'react';
import Link from 'next/link';
import Image from 'next/image';
import {useTranslations,useFormatter} from 'next-intl';
import {useRequestIntent} from '@/lib/client/useRequestIntent';
import type {ArcOffer,ArcApplication,ArcApplicationStatus} from '@/types/database';
interface CardProps {arc:ArcOffer;actorId:string|null;onChanged?:(status:ArcApplicationStatus)=>void;}
export function ArcOfferCard(props:CardProps){return <OwnedArcOfferCard key={(props.actorId??'')+':'+props.arc.id} {...props}/>;}
function OwnedArcOfferCard({arc,actorId,onChanged}:CardProps){
  const t=useTranslations('arcs'),common=useTranslations('common'),format=useFormatter(),intent=useRequestIntent(actorId??undefined),[status,setStatus]=useState(arc.my_application_status),[saving,setSaving]=useState(false),[failed,setFailed]=useState(false);
  useEffect(()=>setStatus(arc.my_application_status),[arc.my_application_status]);
  async function apply(){if(saving||!actorId)return;setSaving(true);setFailed(false);const scope='arc.apply.'+arc.id;
    try{const response=await fetch('/api/author/arcs/'+arc.id+'/apply',{method:'POST',headers:{'Content-Type':'application/json',...await intent.durableHeaders({},scope)},body:'{}'}),data=await response.json(),application=data.application as ArcApplication;
      if(!response.ok||data.actorId!==actorId||data.arcId!==arc.id||!application?.id||application.arc_id!==arc.id||application.reader_id!==actorId||!['pending','approved','rejected'].includes(application.status))throw Error();intent.complete(scope);setStatus(application.status);onChanged?.(application.status);
    }catch{setFailed(true);}finally{setSaving(false);}
  }
  return <article id={'arc-'+arc.id} className="rounded-xl border bg-card p-4"><div className="flex gap-4">{arc.books.cover_url&&<Image src={arc.books.cover_url} alt={arc.books.title} width={64} height={96} className="rounded object-cover self-start"/>}<div className="min-w-0 flex-1"><Link href={'/book/'+arc.books.id} className="font-semibold hover:underline">{arc.books.title}</Link><p className="text-sm text-muted-foreground">{arc.books.author_name}</p>{arc.description&&<p className="text-sm mt-2 whitespace-pre-wrap">{arc.description}</p>}<p className="text-xs text-muted-foreground mt-3">{t('slotsRemaining',{count:arc.slots_remaining})} · {t(arc.is_open?'open':'closed')}</p>{arc.close_date&&<p className="text-xs text-muted-foreground mt-1">{t('closes',{date:format.dateTime(new Date(arc.close_date),{year:'numeric',month:'short',day:'numeric',timeZone:'UTC'})})}</p>}
    <div className="mt-3 flex flex-wrap items-center gap-3">{actorId===arc.author_id?<Link href={'/author/arcs/'+arc.id} className="text-sm underline">{t('manage')}</Link>:status?<span className="text-sm font-medium">{t(status)}</span>:arc.can_apply?<button type="button" onClick={()=>void apply()} disabled={saving} className="rounded-lg bg-accent text-white text-sm px-3 py-1.5 disabled:opacity-50">{saving?common('saving'):t('apply')}</button>:!actorId&&arc.is_open?<Link href="/login" className="text-sm underline">{t('signIn')}</Link>:<span className="text-sm text-muted-foreground">{t(!arc.is_open?'closed':arc.slots_remaining<=0?'full':'unavailable')}</span>}</div>{failed&&<p role="alert" className="text-sm text-destructive mt-2">{t('saveFailed')}</p>}</div></div></article>;
}
export function ArcCatalog({actorId,owned=false,authorId=null}:{actorId:string;owned?:boolean;authorId?:string|null}){
  const t=useTranslations('arcs'),common=useTranslations('common'),[arcs,setArcs]=useState<ArcOffer[]>([]),[nextCursor,setNextCursor]=useState<string|null>(null),[loading,setLoading]=useState(true),[failed,setFailed]=useState(false),[generation,setGeneration]=useState(0),controller=useRef<AbortController|null>(null),last=useRef<string|null>(null),endpoint=owned?'/api/author/arcs':'/api/arcs';
  const load=useCallback(async(cursor:string|null=null)=>{controller.current?.abort();const request=new AbortController();controller.current=request;last.current=cursor;setLoading(true);setFailed(false);
    try{const response=await fetch(endpoint+'?'+new URLSearchParams({...(!owned&&authorId?{authorId}:{}),...(cursor?{cursor}:{})}),{signal:request.signal}),data=await response.json();if(!response.ok||data.actorId!==actorId||!Array.isArray(data.arcs))throw Error();setArcs(previous=>cursor?[...new Map([...previous,...data.arcs].map(arc=>[arc.id,arc])).values()]:data.arcs);setNextCursor(data.nextCursor);}catch{if(!request.signal.aborted)setFailed(true);}finally{if(!request.signal.aborted)setLoading(false);}
  },[actorId,endpoint,owned,authorId]);
  useEffect(()=>{setArcs([]);setNextCursor(null);void load();return()=>controller.current?.abort();},[load,generation]);
  return <div className="max-w-2xl mx-auto px-4 py-6 space-y-5"><div className="flex items-start justify-between gap-3"><div><h1 className="font-display text-2xl font-bold">{t(owned?'myArcs':'title')}</h1><p className="text-sm text-muted-foreground mt-1">{t(owned?'ownerDescription':'description')}</p></div>{owned&&<Link href="/author/arcs/new" className="text-sm underline shrink-0">{t('create')}</Link>}</div>
    {failed&&<p role="alert" className="text-sm text-destructive">{t('loadFailed')} <button type="button" onClick={()=>void load(last.current)} className="underline">{common('retry')}</button></p>}{loading&&<p role="status" className="text-sm">{common('loading')}</p>}{!loading&&!failed&&!arcs.length&&<p className="text-sm text-muted-foreground">{t(owned?'noOwned':'empty')}</p>}
    <div className="space-y-4">{arcs.map(arc=><div key={arc.id}>{owned&&<p className="text-xs text-muted-foreground mb-1">{t('applicationCount',{count:arc.total_applications??0})} · {t('approvedCount',{count:arc.approved_count})}</p>}<ArcOfferCard arc={arc} actorId={actorId} onChanged={status=>setArcs(previous=>previous.map(row=>row.id===arc.id?{...row,my_application_status:status,can_apply:false}:row))}/></div>)}</div>
    {nextCursor&&<button type="button" disabled={loading} onClick={()=>void load(nextCursor)} className="text-sm underline">{common('loadMore')}</button>}<button type="button" disabled={loading} onClick={()=>setGeneration(value=>value+1)} className="block text-sm underline">{t('refresh')}</button>
  </div>;
}

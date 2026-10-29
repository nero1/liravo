'use client';
import {useState,useEffect} from 'react';
import {useTranslations} from 'next-intl';
import {useRouter} from 'next/navigation';
import Link from 'next/link';
import {useRequestIntent} from '@/lib/client/useRequestIntent';
interface Author {display_name:string;username:string;}
interface Room {id:string;name:string;topic:string|null;member_count:number;max_members:number;is_active:boolean;}
interface Draft {id:string;user_id:string;title:string;excerpt:string;word_count:number;users:Author|null;}
interface Feedback {id:string;user_id:string;comment:string;users:Author|null;}
const field='w-full rounded-lg border bg-background px-3 py-2 text-sm mt-1';
const button='rounded-lg bg-amber-600 hover:bg-amber-700 disabled:opacity-50 text-white text-sm font-medium px-4 py-2';

function FeedbackList({roomId,draftId,actorId,active}:{roomId:string;draftId:string;actorId:string;active:boolean}){
  const t=useTranslations('nativeWriting'),common=useTranslations('common'),writing=useTranslations('writing'),intent=useRequestIntent(actorId),[open,setOpen]=useState(false),[items,setItems]=useState<Feedback[]>([]),[cursor,setCursor]=useState<string|null>(null),[loading,setLoading]=useState(false),[failed,setFailed]=useState(false),[comment,setComment]=useState(''),[saving,setSaving]=useState(false),[saveFailed,setSaveFailed]=useState(false),scope='workshop.feedback.'+draftId,path=`/api/write/workshops/${roomId}/submissions/${draftId}/feedback`;
  async function load(next:string|null=null){
    if(loading)return;setLoading(true);setFailed(false);
    try{const response=await fetch(path+(next?'?cursor='+encodeURIComponent(next):''),{headers:{'X-Liravo-Actor':actorId}}),data=await response.json();if(!response.ok||!Array.isArray(data.feedback))throw Error('Feedback unavailable');setItems(previous=>next?[...new Map([...previous,...data.feedback].map(item=>[item.id,item])).values()]:data.feedback);setCursor(data.nextCursor??null);}catch{setFailed(true);}finally{setLoading(false);}
  }
  async function save(event:React.FormEvent){
    event.preventDefault();if(saving)return;setSaving(true);setSaveFailed(false);
    const body={comment:comment.trim()};
    try{const response=await fetch(path,{method:'POST',headers:{'Content-Type':'application/json',...await intent.durableHeaders(body,scope)},body:JSON.stringify(body)}),data=await response.json();if(data.code==='WORKSHOP_FEEDBACK_EXISTS'){await load();return;}if(!response.ok||!data.feedback?.id||data.feedback.user_id!==actorId)throw Error('Invalid feedback receipt');intent.complete(scope);setComment('');await load();}catch{setSaveFailed(true);}finally{setSaving(false);}
  }
  if(!open)return <button type="button" onClick={()=>{setOpen(true);void load();}} className="text-sm text-amber-600">{t('feedback')}</button>;
  return <div className="space-y-3 mt-3">
    {items.map(item=><div key={item.id} className="rounded-lg bg-muted p-3"><p className="text-sm">{item.comment}</p><p className="text-xs text-muted-foreground mt-1">{item.users?.display_name??writing('writer')}</p></div>)}
    {failed&&<p role="alert" className="text-sm text-destructive">{writing('loadFailure')} <button type="button" onClick={()=>void load(cursor)} className="underline">{common('retry')}</button></p>}
    {loading?<p role="status" className="text-sm text-muted-foreground">{common('loading')}</p>:cursor&&<button type="button" onClick={()=>void load(cursor)} className="text-sm text-amber-600">{common('loadMore')}</button>}
    {items.some(item=>item.user_id===actorId)?<p className="text-sm text-muted-foreground">{t('feedbackSubmitted')}</p>:active&&<form onSubmit={save} aria-busy={saving} className="space-y-2"><label className="block text-sm" htmlFor={'feedback-'+draftId}>{t('feedback')}<textarea id={'feedback-'+draftId} value={comment} onChange={event=>setComment(event.target.value)} maxLength={500} required disabled={saving} rows={3} placeholder={t('feedbackPlaceholder')} className={field}/></label>{saveFailed&&<p role="alert" className="text-sm text-destructive">{writing('submitFailure')}</p>}<button type="submit" disabled={saving||loading||!comment.trim()} className={button}>{saving?common('saving'):t('sendFeedback')}</button></form>}
  </div>;
}

export function WorkshopRoom({roomId,actorId}:{roomId:string;actorId:string}){
  const t=useTranslations('nativeWriting'),common=useTranslations('common'),writing=useTranslations('writing'),intent=useRequestIntent(actorId),router=useRouter(),[room,setRoom]=useState<Room|null>(null),[drafts,setDrafts]=useState<Draft[]>([]),[cursor,setCursor]=useState<string|null>(null),[loading,setLoading]=useState(true),[failed,setFailed]=useState(false),[needsJoin,setNeedsJoin]=useState(false),[joining,setJoining]=useState(false),[joinFailed,setJoinFailed]=useState(false),[revision,setRevision]=useState(0),[title,setTitle]=useState(''),[excerpt,setExcerpt]=useState(''),[saving,setSaving]=useState(false),[saveFailed,setSaveFailed]=useState(false),[saved,setSaved]=useState(false),[moreLoading,setMoreLoading]=useState(false),[moreFailed,setMoreFailed]=useState(false),path='/api/write/workshops/'+roomId;
  useEffect(()=>{
    const controller=new AbortController();setLoading(true);setFailed(false);setNeedsJoin(false);
    void(async()=>{try{
      const response=await fetch(path+'?summary=1',{signal:controller.signal,headers:{'X-Liravo-Actor':actorId}}),data=await response.json();
      if(response.status===409)router.refresh();if(response.status===403){if(!controller.signal.aborted){setRoom(null);setDrafts([]);setNeedsJoin(true);}return;}
      if(!response.ok||data.room?.id!==roomId)throw Error('Invalid workshop');
      const entries=await fetch(path+'/submissions',{signal:controller.signal,headers:{'X-Liravo-Actor':actorId}}),page=await entries.json();if(!entries.ok||!Array.isArray(page.submissions))throw Error('Submissions unavailable');
      if(!controller.signal.aborted){setRoom(data.room);setDrafts(page.submissions);setCursor(page.nextCursor??null);}
    }catch{if(!controller.signal.aborted)setFailed(true);}finally{if(!controller.signal.aborted)setLoading(false);}})();
    return()=>controller.abort();
  },[path,roomId,actorId,revision,router]);
  async function join(){
    if(joining)return;setJoining(true);setJoinFailed(false);
    try{const response=await fetch(path+'/join',{method:'POST',headers:{'X-Liravo-Actor':actorId}}),data=await response.json();if(response.status===409&&data.code==='ACCOUNT_CHANGED')router.refresh();if(!response.ok||data.joined!==true)throw Error('Invalid membership receipt');setRevision(value=>value+1);}catch{setJoinFailed(true);}finally{setJoining(false);}
  }
  async function more(){
    if(!cursor||moreLoading)return;setMoreLoading(true);setMoreFailed(false);
    try{const response=await fetch(path+'/submissions?cursor='+encodeURIComponent(cursor),{headers:{'X-Liravo-Actor':actorId}}),data=await response.json();if(!response.ok||!Array.isArray(data.submissions))throw Error('Submissions unavailable');setDrafts(previous=>[...new Map([...previous,...data.submissions].map(item=>[item.id,item])).values()]);setCursor(data.nextCursor??null);}catch{setMoreFailed(true);}finally{setMoreLoading(false);}
  }
  async function save(event:React.FormEvent){
    event.preventDefault();if(saving)return;setSaving(true);setSaveFailed(false);setSaved(false);const body={title:title.trim(),excerpt:excerpt.trim()},scope='workshop.draft.'+roomId;
    try{const response=await fetch(path+'/submissions',{method:'POST',headers:{'Content-Type':'application/json',...await intent.durableHeaders(body,scope)},body:JSON.stringify(body)}),data=await response.json();if(response.status===409&&data.code==='ACCOUNT_CHANGED')router.refresh();if(!response.ok||!data.submission?.id||data.submission.user_id!==actorId)throw Error('Invalid draft receipt');intent.complete(scope);setTitle('');setExcerpt('');setSaved(true);setRevision(value=>value+1);}catch{setSaveFailed(true);}finally{setSaving(false);}
  }
  return <div className="max-w-2xl mx-auto px-4 py-6 space-y-5">
    <Link href="/write/workshops" className="text-sm text-muted-foreground hover:underline">{t('backWorkshops')}</Link>
    {loading?<p role="status">{common('loading')}</p>:failed?<p role="alert">{writing('loadFailure')} <button onClick={()=>setRevision(value=>value+1)} className="underline">{common('retry')}</button></p>:needsJoin?<div className="space-y-3"><p>{t('membersOnly')}</p>{joinFailed&&<p role="alert" className="text-destructive">{t('joinFailed')}</p>}<button disabled={joining} onClick={()=>void join()} className={button}>{joining?common('saving'):t('joinWorkshop')}</button></div>:room&&<>
      <header><h1 className="font-display text-2xl font-bold">{room.name}</h1>{room.topic&&<p className="text-muted-foreground mt-1">{room.topic}</p>}<p className="text-sm text-muted-foreground mt-1">{t('memberCapacity',{count:room.member_count,max:room.max_members})}</p></header>
      {room.is_active?<form onSubmit={save} aria-busy={saving} className="rounded-xl border bg-card p-4 space-y-3"><fieldset disabled={saving} className="space-y-3"><label className="block text-sm" htmlFor="draft-title">{t('draftTitle')}<input id="draft-title" required maxLength={200} value={title} onChange={event=>setTitle(event.target.value)} className={field}/></label><label className="block text-sm" htmlFor="draft-excerpt">{t('excerpt')}<textarea id="draft-excerpt" required maxLength={1000} rows={5} value={excerpt} onChange={event=>setExcerpt(event.target.value)} className={field}/></label></fieldset>{saveFailed&&<p role="alert" className="text-sm text-destructive">{writing('submitFailure')}</p>}{saved&&<p role="status" className="text-sm text-green-600">{t('draftSaved')}</p>}<button type="submit" disabled={saving||!title.trim()||!excerpt.trim()} className={button}>{saving?common('saving'):t('submitDraft')}</button></form>:<p>{t('workshopClosed')}</p>}
      <section className="space-y-4"><h2 className="font-semibold">{t('submissions')}</h2>{!drafts.length?<p className="text-sm text-muted-foreground">{t('noSubmissions')}</p>:drafts.map(draft=><article key={draft.id} className="rounded-xl border bg-card p-4"><h3 className="font-semibold">{draft.title}</h3><p className="text-sm whitespace-pre-wrap my-2">{draft.excerpt}</p><p className="text-xs text-muted-foreground">{draft.users?.display_name??writing('writer')} · {writing('wordCount',{count:draft.word_count})}</p><FeedbackList roomId={roomId} draftId={draft.id} actorId={actorId} active={room.is_active}/></article>)}{moreFailed&&<p role="alert" className="text-sm text-destructive">{writing('loadFailure')}</p>}{cursor&&<button onClick={()=>void more()} disabled={moreLoading} className="text-sm text-amber-600">{moreLoading?common('loading'):moreFailed?common('retry'):common('loadMore')}</button>}</section>
    </>}
  </div>;
}

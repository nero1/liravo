'use client';
import {useCallback,useEffect,useRef,useState} from 'react';
import {useTranslations} from 'next-intl';
import Link from 'next/link';
type Review={id:string;created_at:string;content:string;username:string;title:string;rating:number;book_id:string};
export function ReviewModerationQueue({actorId}:{actorId:string}){
 const t=useTranslations('moderation'),common=useTranslations('common'),[rows,setRows]=useState<Review[]>([]),[next,setNext]=useState<string|null>(null),[busy,setBusy]=useState(true),[failed,setFailed]=useState(false),alive=useRef(true),working=useRef(false),revision=useRef(0);
 const cancel=useCallback(()=>{alive.current=false;revision.current++;working.current=false;},[]);
 const load=useCallback(async(cursor:string|null,signal?:AbortSignal)=>{
  if(working.current)return;working.current=true;const run=++revision.current;setBusy(true);setFailed(false);
  try{const response=await fetch('/api/moderation/reviews'+(cursor?'?cursor='+encodeURIComponent(cursor):''),{cache:'no-store',signal}),data=await response.json();if(!response.ok||data.actorId!==actorId||!Array.isArray(data.reviews))throw Error();if(alive.current&&run===revision.current&&!signal?.aborted){setRows(previous=>cursor?[...previous,...data.reviews]:data.reviews);setNext(data.nextCursor);}}
  catch{if(alive.current&&run===revision.current&&!signal?.aborted)setFailed(true);}finally{if(run===revision.current){working.current=false;if(alive.current&&!signal?.aborted)setBusy(false);}}
 },[actorId]);
 useEffect(()=>{alive.current=true;const controller=new AbortController();void load(null,controller.signal);return()=>{cancel();controller.abort();};},[load,cancel]);
 async function decide(reviewId:string,status:'published'|'removed'){
  if(working.current)return;working.current=true;const run=++revision.current;setBusy(true);setFailed(false);
  try{const response=await fetch('/api/moderation/reviews',{method:'PATCH',headers:{'Content-Type':'application/json','X-Liravo-Actor':actorId},body:JSON.stringify({reviewId,status})}),data=await response.json();if(!response.ok||data.actorId!==actorId||data.reviewId!==reviewId||!['published','removed'].includes(data.status))throw Error();if(alive.current&&run===revision.current)setRows(previous=>previous.filter(row=>row.id!==reviewId));}
  catch{if(alive.current&&run===revision.current)setFailed(true);}finally{if(run===revision.current){working.current=false;if(alive.current)setBusy(false);}}
 }
 return <div className="space-y-4" aria-busy={busy}><h1 className="font-display text-2xl font-bold">{t('pendingReviews')}</h1><p className="text-muted-foreground">{t('pendingReviewDescription')}</p>{failed&&<p role="alert">{t('unavailable')} <button disabled={busy} onClick={()=>void load(null)} className="underline">{common('retry')}</button></p>}{rows.map(row=><article key={row.id} className="border rounded-xl p-4 space-y-3"><Link href={'/book/'+row.book_id} className="font-semibold underline">{row.title}</Link><p className="text-sm text-muted-foreground">@{row.username} · {row.rating}/5</p><p className="whitespace-pre-wrap">{row.content}</p><div className="flex gap-3"><button disabled={busy} className="rounded-lg border px-3 py-2" onClick={()=>void decide(row.id,'published')}>{t('approveReview')}</button><button disabled={busy} className="rounded-lg border px-3 py-2" onClick={()=>void decide(row.id,'removed')}>{t('rejectReview')}</button></div></article>)}{!rows.length&&!busy&&!failed&&<p>{t('reviewsEmpty')}</p>}{next&&<button disabled={busy} onClick={()=>void load(next)} className="underline">{common('loadMore')}</button>}</div>;
}

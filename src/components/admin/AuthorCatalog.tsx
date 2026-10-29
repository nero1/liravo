'use client';
import {useEffect,useRef,useState} from 'react';
import {useTranslations} from 'next-intl';
import {useRequestIntent} from '@/lib/client/useRequestIntent';
interface Book {id:string;work_id:string;title:string;author_name:string;isbn_13:string|null;}
interface Data {actorId:string;author:{id:string;username:string;is_verified_author:boolean};verification:{pen_name:string;publisher:string|null;book_titles:string;website_url:string|null;social_proof_url:string|null;status:string}|null;books:Book[];total:number;nextCursor:string|null;matches:Book[];}
export function AuthorCatalog({authorId,onClose}:{authorId:string;onClose:()=>void}){
  const t=useTranslations('authorCatalog'),common=useTranslations('common'),dialog=useRef<HTMLDialogElement>(null),[data,setData]=useState<Data|null>(null),[q,setQ]=useState(''),[cursor,setCursor]=useState<string|null>(null),[generation,setGeneration]=useState(0),[loading,setLoading]=useState(true),[saving,setSaving]=useState(false),[failed,setFailed]=useState(false),[saved,setSaved]=useState(false),intent=useRequestIntent(data?.actorId);
  useEffect(()=>{dialog.current?.showModal();},[]);
  useEffect(()=>{
    const controller=new AbortController();setLoading(true);setFailed(false);
    const timer=setTimeout(()=>{void fetch(`/api/admin/users/${authorId}/books?`+new URLSearchParams({q,...(cursor?{cursor}:{})}),{signal:controller.signal}).then(async response=>{if(!response.ok)throw Error();const next=await response.json() as Data;setData(previous=>cursor&&previous?{...next,books:[...previous.books,...next.books]}:next);}).catch(()=>{if(!controller.signal.aborted)setFailed(true);}).finally(()=>{if(!controller.signal.aborted)setLoading(false);});},q?250:0);
    return()=>{clearTimeout(timer);controller.abort();};
  },[authorId,q,cursor,generation]);
  function reload(){setCursor(null);setGeneration(value=>value+1);}
  async function save(book:Book,granted:boolean){
    if(!data||saving)return;setSaving(true);setFailed(false);setSaved(false);
    const body={book_id:book.id,granted},scope='author.work.'+authorId+'.'+book.work_id;
    try{const response=await fetch(`/api/admin/users/${authorId}/books`,{method:'PUT',headers:{'Content-Type':'application/json',...await intent.durableHeaders(body,scope)},body:JSON.stringify(body)}),receipt=await response.json();
      if(!response.ok||receipt.actorId!==data.actorId||receipt.authorId!==authorId||receipt.bookId!==book.id||receipt.granted!==granted)throw Error();
      intent.complete(scope);setSaved(true);reload();
    }catch{setFailed(true);}finally{setSaving(false);}
  }
  async function verify(approved:boolean){
    if(!data||saving)return;setSaving(true);setFailed(false);setSaved(false);const body={userId:authorId,approved},scope='author.verify.'+authorId;
    try{const response=await fetch('/api/admin/verify-author',{method:'POST',headers:{'Content-Type':'application/json',...await intent.durableHeaders(body,scope)},body:JSON.stringify(body)}),receipt=await response.json();if(!response.ok||receipt.user?.id!==authorId)throw Error();intent.complete(scope);setSaved(true);reload();}catch{setFailed(true);}finally{setSaving(false);}
  }
  function row(book:Book,granted:boolean){return <div key={book.id} className="flex justify-between gap-3 border-b py-2 text-sm"><div><p>{book.title}</p><p className="text-muted-foreground">{book.author_name}{book.isbn_13?' · '+book.isbn_13:''}</p></div><button type="button" onClick={()=>void save(book,granted)} disabled={saving||loading} className="underline shrink-0">{t(granted?'approveWork':'revokeWork')}</button></div>;}
  return <dialog ref={dialog} onCancel={onClose} onClose={onClose} aria-labelledby="author-catalog-title" className="w-full max-w-2xl max-h-[85vh] overflow-y-auto rounded-xl border bg-background text-foreground p-5 backdrop:bg-black/40">
    <div className="flex items-center justify-between gap-3 mb-4"><h2 id="author-catalog-title" className="font-semibold">{t('manage')}{data?' — @'+data.author.username:''}</h2><button type="button" onClick={onClose} className="text-sm underline">{common('close')}</button></div>
    <p className="text-sm text-muted-foreground mb-4">{t('explanation')}</p>
    {failed&&<div role="alert" className="text-destructive text-sm mb-3">{t('failed')} <button type="button" onClick={reload} disabled={saving} className="underline">{common('retry')}</button></div>}
    {saved&&<p role="status" className="text-sm text-green-700 mb-3">{t('saved')}</p>}
    {data?.verification&&<section className="rounded-lg border p-3 mb-4 text-sm"><h3 className="font-medium">{t('verification')}</h3><p>{data.verification.pen_name}</p>{data.verification.publisher&&<p>{data.verification.publisher}</p>}<p className="whitespace-pre-wrap">{data.verification.book_titles}</p>{[data.verification.website_url,data.verification.social_proof_url].filter(Boolean).map(url=><p key={url} className="break-all">{url}</p>)}{data.verification.status==='pending'&&<div className="flex gap-3 mt-3"><button type="button" disabled={saving||loading} onClick={()=>void verify(true)} className="rounded border px-3 py-1">{t('approveAuthor')}</button><button type="button" disabled={saving||loading} onClick={()=>void verify(false)} className="rounded border px-3 py-1">{t('rejectAuthor')}</button></div>}</section>}
    {data&&!data.author.is_verified_author?<p className="text-sm">{t('verifyFirst')}</p>:<>
      <label htmlFor="author-book-search" className="block text-sm mb-4">{t('search')}<input id="author-book-search" type="search" value={q} disabled={saving} maxLength={200} onChange={event=>{setCursor(null);setQ(event.target.value);}} className="block mt-1 w-full rounded-lg border bg-background px-3 py-2"/></label>
      {loading&&<p role="status" className="text-sm">{common('loading')}</p>}
      {q.trim().length>=2&&!loading&&<section className="mb-5"><h3 className="font-medium text-sm mb-2">{t('results')}</h3>{!data?.matches.length&&<p className="text-sm text-muted-foreground">{t('noMatches')}</p>}{data?.matches.map(book=>row(book,true))}</section>}
      <h3 className="font-medium text-sm">{t('approved')}</h3>{!loading&&!data?.books.length&&<p className="text-sm text-muted-foreground mt-2">{t('none')}</p>}
      {data?.books.map(book=>row(book,false))}
      {data?.nextCursor&&<button type="button" disabled={loading||saving} onClick={()=>setCursor(data.nextCursor)} className="underline text-sm mt-3">{common('loadMore')}</button>}
    </>}
  </dialog>;
}

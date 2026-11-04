'use client';
import {useEffect,useRef,useState,useTransition} from 'react';
import {useRouter} from 'next/navigation';
import {useTranslations} from 'next-intl';
import {useRequestIntent} from '@/lib/client/useRequestIntent';
interface Props{bookId:string;userId:string;title:string;initial:boolean;}
interface Receipt{actorId:string;bookId:string;editionId:string;has_audiobook:boolean;updated?:boolean;}
export function AudiobookToggle({bookId,userId,title,initial}:Props){
  const t=useTranslations('admin'),router=useRouter(),intent=useRequestIntent(userId),busy=useRef(false),alive=useRef(false),[pending,setPending]=useState(false),[refreshing,startTransition]=useTransition(),[error,setError]=useState(false);
  useEffect(()=>{alive.current=true;return()=>{alive.current=false;};},[]);
  const owned=(receipt:Receipt,desired:boolean)=>receipt?.actorId===userId&&receipt.bookId===bookId&&receipt.editionId===bookId&&receipt.has_audiobook===desired;
  async function toggle(){
    if(busy.current||refreshing||!alive.current)return;busy.current=true;setPending(true);setError(false);
    const desired=!initial,scope='admin.audiobook.'+bookId,body={has_audiobook:desired};
    try{
      const headers=await intent.durableHeaders(body,scope);
      try{const response=await fetch(`/api/admin/books/${bookId}/audiobook`,{method:'PATCH',headers:{'Content-Type':'application/json',...headers},body:JSON.stringify(body)}),receipt=await response.json() as Receipt;if(!response.ok||!owned(receipt,desired)||receipt.updated!==true)throw Error('Invalid audiobook receipt');}
      catch{const response=await fetch(`/api/admin/books/${bookId}/audiobook`,{headers:{'X-Liravo-Actor':userId},cache:'no-store'}),receipt=await response.json() as Receipt;if(!response.ok||!owned(receipt,desired))throw Error('Audiobook state unavailable');}
      intent.complete(scope,headers['Idempotency-Key']);if(alive.current)startTransition(()=>router.refresh());
    }catch{if(alive.current)setError(true);}
    finally{busy.current=false;if(alive.current)setPending(false);}
  }
  return <div><button type="button" role="switch" data-book-id={bookId} aria-checked={initial} aria-busy={pending||refreshing} aria-describedby={'edition-'+bookId} aria-label={t('audiobookForBook',{title})} disabled={pending||refreshing} onClick={toggle} className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors disabled:opacity-50 ${initial?'bg-accent':'bg-muted'}`}><span className={`inline-block h-3.5 w-3.5 transform rounded-full bg-white shadow transition-transform ${initial?'translate-x-4':'translate-x-1'}`}/></button>{error&&<p role="alert" className="text-xs text-destructive">{t('updateFailed')}</p>}</div>;
}

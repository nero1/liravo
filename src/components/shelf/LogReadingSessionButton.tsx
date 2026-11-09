'use client';

import Link from 'next/link';
import {useEffect,useRef,useState} from 'react';
import {useRouter} from 'next/navigation';
import {useTranslations} from 'next-intl';
import {BookOpen} from 'lucide-react';
import {useRequestIntent} from '@/lib/client/useRequestIntent';

type Props={bookId:string;userId:string;onLogged?:(pagesRead:number)=>void};
export function LogReadingSessionButton(props:Props){return <OwnedSessionButton key={props.userId+':'+props.bookId} {...props}/>;}
function OwnedSessionButton({bookId,userId,onLogged}:Props){
  const history=useTranslations('readingHistory'),t=useTranslations('books'),common=useTranslations('common'),intent=useRequestIntent(userId),router=useRouter(),busy=useRef(false),timer=useRef<ReturnType<typeof setTimeout>|undefined>(undefined);
  const [open,setOpen]=useState(false),[pages,setPages]=useState(''),[saving,setSaving]=useState(false),[done,setDone]=useState(false),[error,setError]=useState(false);
  useEffect(()=>()=>clearTimeout(timer.current),[]);
  async function submit(event:React.FormEvent){
    event.preventDefault();if(busy.current)return;busy.current=true;setSaving(true);setError(false);
    const body={book_id:bookId,...(pages?{pages_read:Number(pages)}:{})},scope='reading-session:'+bookId;
    try{
      const response=await fetch('/api/reading-sessions',{method:'POST',headers:{'Content-Type':'application/json',...await intent.durableHeaders(body,scope)},body:JSON.stringify(body)});
      if(!response.ok)throw new Error('Reading session unavailable');const result=await response.json();if(typeof result.session?.id!=='string')throw new Error('Invalid reading receipt');intent.complete(scope);
      setDone(true);onLogged?.(Number(pages)||0);router.refresh();timer.current=setTimeout(()=>{setDone(false);setOpen(false);setPages('');},1500);
    }catch{setError(true);}finally{busy.current=false;setSaving(false);}
  }
  if(done)return <span role="status" className="text-xs text-green-600 font-medium">{t('sessionLogged')}</span>;
  if(!open)return <div className="flex gap-2"><Link className="text-xs text-accent" href={'/reading-sessions?book_id='+bookId}>{history('title')}</Link><button type="button" onClick={()=>setOpen(true)} className="flex items-center gap-1 text-xs text-muted-foreground hover:text-accent transition-colors"><BookOpen size={12} aria-hidden="true"/>{t('logSession')}</button></div>;
  return <form onSubmit={submit} className="flex flex-wrap items-center gap-1.5 mt-1">{error&&<span role="alert" className="text-xs text-destructive">{t('sessionFailed')}</span>}<label htmlFor={'session-pages-'+bookId} className="sr-only">{t('pagesRead')}</label><input id={'session-pages-'+bookId} type="number" min={1} max={9999} step={1} disabled={saving} value={pages} onChange={event=>setPages(event.target.value)} placeholder={t('pagesRead')} className="w-24 text-xs rounded border border-border bg-card px-2 py-1 focus:outline-none focus:ring-1 focus:ring-accent"/><button type="submit" disabled={saving} className="text-xs px-2 py-1 rounded bg-accent text-accent-foreground hover:opacity-90 disabled:opacity-50">{saving?common('loading'):t('log')}</button><button type="button" disabled={saving} onClick={()=>setOpen(false)} aria-label={common('close')} className="text-xs text-muted-foreground hover:text-foreground">{common('cancel')}</button></form>;
}

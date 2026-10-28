'use client';

import {useState,useRef,useEffect} from 'react';
import {useTranslations,useLocale,useFormatter} from 'next-intl';
import Link from 'next/link';
import {useRouter} from 'next/navigation';
import type {BookRow,WorkCatalog} from '@/types/database';

interface Props {catalog:WorkCatalog;book?:BookRow;}
export function EditionSelector(props:Props){return <WorkEditionSelector key={props.catalog.work.id+':'+(props.book?.id??'work')} {...props}/>;}
function WorkEditionSelector({catalog,book}:Props){
  const router=useRouter(),t=useTranslations('editions'),common=useTranslations('common'),locale=useLocale(),formatter=useFormatter(),busy=useRef(false),controller=useRef(new AbortController());
  const [work,setWork]=useState(catalog.work);
  const [editions,setEditions]=useState(()=>book&&!catalog.editions.some(edition=>edition.id===book.id)?[book,...catalog.editions]:catalog.editions);
  const [cursor,setCursor]=useState(catalog.nextCursor),[providerCursor,setProviderCursor]=useState<string|null>(null),[providerComplete,setProviderComplete]=useState(false),[loading,setLoading]=useState(false),[error,setError]=useState(false),[skipped,setSkipped]=useState(0);
  useEffect(()=>{const current=new AbortController();controller.current=current;return()=>current.abort();},[]);
  async function loadMore(){
    if(busy.current)return;busy.current=true;setLoading(true);setError(false);
    try{
      const local=!!cursor,response=await fetch('/api/works/'+work.id+(local?'?cursor='+encodeURIComponent(cursor!):'/editions'),{signal:controller.current.signal,...(local?{}:{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({cursor:providerCursor})})}),data=await response.json();
      const currentWork=data.work??work;
      if(!response.ok||!Array.isArray(data.editions)||data.editions.some((edition:BookRow)=>edition.work_id!==currentWork.id||typeof edition.id!=='string'))throw new Error('Invalid editions page');
      if(local&&data.nextCursor===cursor)throw new Error('Repeated editions cursor');
      if(controller.current.signal.aborted)return;
      setWork(currentWork);
      setEditions(previous=>[...new Map([...previous.map(edition=>({...edition,work_id:currentWork.id})),...data.editions].map(edition=>[edition.id,edition])).values()]);
      if(local)setCursor(data.nextCursor??null);else{setCursor(data.localCursor??null);setProviderCursor(data.providerCursor??null);setProviderComplete(data.providerComplete===true);setSkipped(Number.isInteger(data.skipped)?data.skipped:0);}
      if(currentWork.id!==catalog.work.id||currentWork.title!==catalog.work.title||currentWork.open_library_id!==catalog.work.open_library_id)router.refresh();
    }catch{if(!controller.current.signal.aborted)setError(true);}
    finally{busy.current=false;if(!controller.current.signal.aborted)setLoading(false);}
  }
  function description(edition:BookRow){
    let language=edition.language;try{language=new Intl.DisplayNames([locale],{type:'language'}).of(language)??language;}catch{}
    return [language,edition.format?t('formats.'+edition.format):null,edition.edition_name,edition.publisher,edition.published_year?formatter.number(edition.published_year,{useGrouping:false}):null].filter(Boolean).join(' · ');
  }
  return <section className="space-y-3" aria-label={t('title')}>
    <h2 className="font-display font-bold text-lg">{t('ofWork',{title:work.title})}</h2>
    {book&&<Link href={'/work/'+work.id} className="text-sm text-accent hover:underline">{t('viewWork')}</Link>}
    <p className="text-sm text-muted-foreground">{t('trackingHint')}</p>
    <ul className="space-y-2">{editions.map(edition=><li key={edition.id}><Link href={'/book/'+edition.id} aria-current={book?.id===edition.id?'page':undefined} className="block rounded-lg border border-border p-3 hover:bg-muted">
      <p className="font-medium text-sm">{edition.title}{book?.id===edition.id?' · '+t('selected'):''}</p>
      <p className="text-xs text-muted-foreground">{description(edition)}</p>
      <p className="text-xs text-muted-foreground">{edition.isbn_13||edition.isbn_10?t('isbn',{value:edition.isbn_13??edition.isbn_10!}):t('noIsbn')}</p>
    </Link></li>)}</ul>
    {editions.length===0&&<p className="text-sm text-muted-foreground">{t('empty')}</p>}
    {skipped>0&&<p role="status" className="text-sm text-muted-foreground">{t('skipped',{count:skipped})}</p>}
    {error&&<p role="alert" className="text-sm text-destructive">{t('failed')}</p>}
    {(cursor||!providerComplete&&(work.open_library_id||editions.some(edition=>edition.isbn_13||edition.isbn_10)))&&<button type="button" disabled={loading} onClick={loadMore} className="text-sm text-accent underline disabled:opacity-50">{loading?common('loading'):error?common('retry'):cursor?t('moreSaved'):t('findMore')}</button>}
  </section>;
}

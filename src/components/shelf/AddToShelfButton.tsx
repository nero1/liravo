'use client';

import {useEffect,useRef,useState,useCallback} from 'react';
import {useRouter} from 'next/navigation';
import {useTranslations} from 'next-intl';
import {BookOpen,Check,ChevronDown} from 'lucide-react';
import {useRequestIntent} from '@/lib/client/useRequestIntent';
import type {ShelfRow,ShelfCatalogPage} from '@/types/database';

type Props={bookId:string;userId:string};
export function AddToShelfButton(props:Props){return <OwnedShelfButton key={props.userId+':'+props.bookId} {...props}/>;}
function OwnedShelfButton({bookId,userId}:Props){
  const t=useTranslations('books'),common=useTranslations('common'),router=useRouter(),intent=useRequestIntent(userId),busy=useRef(false),button=useRef<HTMLButtonElement>(null);
  const [shelves,setShelves]=useState<ShelfRow[]>([]),[selected,setSelected]=useState<string[]>([]),[open,setOpen]=useState(false),[loading,setLoading]=useState(true),[saving,setSaving]=useState(false),[error,setError]=useState(false),[cursor,setCursor]=useState<string|null>(null),[selectedTotal,setSelectedTotal]=useState(0),controller=useRef<AbortController|null>(null),lastRead=useRef<string|null>(null);
  const load=useCallback(async(before:string|null=null)=>{
    lastRead.current=before;controller.current?.abort();const current=new AbortController();controller.current=current;setLoading(true);setError(false);
    try{const response=await fetch('/api/shelves?'+new URLSearchParams({bookId,...(before?{cursor:before}:{})}),{signal:current.signal,cache:'no-store',headers:{'X-Liravo-Actor':userId}}),data=await response.json()as ShelfCatalogPage;
      if(!response.ok||data.actorId!==userId||data.bookId!==bookId||!Array.isArray(data.shelves)||!Array.isArray(data.addedToShelves)||typeof data.selectedTotal!=='number'||!(data.nextCursor===null||typeof data.nextCursor==='string'))throw Error();
      if(!current.signal.aborted){setShelves(previous=>before?[...new Map([...previous,...data.shelves].map(shelf=>[shelf.id,shelf])).values()]:data.shelves);setSelected(previous=>before?[...new Set([...previous,...data.addedToShelves])]:data.addedToShelves);setCursor(data.nextCursor);setSelectedTotal(data.selectedTotal);}
    }catch{if(!current.signal.aborted)setError(true);}finally{if(!current.signal.aborted)setLoading(false);}
  },[bookId,userId]);
  useEffect(()=>{void load();return()=>controller.current?.abort();},[load]);
  async function update(shelf:ShelfRow){
    if(busy.current||loading)return;busy.current=true;setSaving(true);setError(false);
    const active=!selected.includes(shelf.id),body={shelfId:shelf.id,bookId,action:active?'add':'remove'},scope='shelf:'+shelf.id+':'+bookId;
    try{
      const response=await fetch('/api/shelf-books/toggle',{method:'POST',headers:{'Content-Type':'application/json',...await intent.durableHeaders(body,scope)},body:JSON.stringify(body)});
      if(!response.ok)throw new Error('Shelf update unavailable');const result=await response.json();if(result.ok!==true)throw new Error('Invalid shelf receipt');intent.complete(scope);
      setSelectedTotal(current=>Math.max(0,current+(active?1:-1)));
      setSelected(current=>active?[...new Set([...current,shelf.id])]:current.filter(id=>id!==shelf.id));
      if(shelf.default_type==='want_to_read')window.dispatchEvent(new CustomEvent('liravo:want-to-read',{detail:{userId,bookId,reacted:active}}));
      router.refresh();
    }catch{lastRead.current=null;setError(true);}finally{busy.current=false;setSaving(false);}
  }
  const labels={want_to_read:'wantToRead',currently_reading:'currentlyReading',have_read:'haveRead'} as const,id='book-shelves-'+bookId;
  return <div className="relative" onKeyDown={event=>{if(event.key==='Escape'){setOpen(false);button.current?.focus();}}}>
    <button ref={button} type="button" onClick={()=>setOpen(value=>!value)} disabled={saving} aria-expanded={open} aria-controls={id} className="flex items-center gap-2 px-4 py-2.5 border border-border rounded-lg text-sm font-medium hover:bg-muted transition-colors disabled:opacity-60">{selectedTotal?<Check size={16} aria-hidden="true" className="text-accent"/>:<BookOpen size={16} aria-hidden="true"/>}{selectedTotal?t('onShelf'):t('addToShelf')}<ChevronDown size={14} aria-hidden="true"/></button>
    {open&&<><button type="button" tabIndex={-1} onClick={()=>setOpen(false)} aria-label={common('close')} className="fixed inset-0 z-40"/><div id={id} role="group" aria-label={t('addToShelf')} className="absolute top-full mt-1 left-0 z-50 bg-card border border-border rounded-xl shadow-lg py-1 min-w-[200px]">{loading&&!shelves.length?<p role="status" className="p-3 text-sm">{common('loading')}</p>:shelves.map(shelf=><button type="button" key={shelf.id} disabled={saving||loading} aria-pressed={selected.includes(shelf.id)} onClick={()=>void update(shelf)} className="w-full flex items-center justify-between px-4 py-2.5 hover:bg-muted text-sm disabled:opacity-60"><span>{shelf.default_type&&shelf.default_type in labels?t(labels[shelf.default_type as keyof typeof labels]):shelf.name}</span>{selected.includes(shelf.id)&&<Check size={14} aria-hidden="true" className="text-accent"/>}</button>)}{cursor&&<button type="button" disabled={loading||saving} onClick={()=>void load(cursor)} className="w-full px-4 py-2.5 text-sm underline">{loading?common('loading'):common('loadMore')}</button>}{error&&<div className="p-3 space-y-2"><p role="alert" className="text-sm text-destructive">{common('error')}</p><button type="button" onClick={()=>void load(lastRead.current)} className="underline text-sm">{common('retry')}</button></div>}{!loading&&!error&&!shelves.length&&<p className="p-3 text-sm">{t('noShelves')}</p>}</div></>}
  </div>;
}

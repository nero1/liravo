'use client';
import {useCallback,useEffect,useRef,useState} from 'react';
import {useTranslations} from 'next-intl';
interface Book {id:string;title:string;isbn_13:string|null;language:string;}
interface Page {actorId:string;books:Book[];nextCursor:string|null;}
export function useAuthorBooks(){
  const [data,setData]=useState<Page|null>(null),[loading,setLoading]=useState(true),[failed,setFailed]=useState(false),controller=useRef<AbortController|null>(null),last=useRef<string|null>(null);
  const load=useCallback(async(cursor:string|null)=>{
    controller.current?.abort();const request=new AbortController();controller.current=request;last.current=cursor;setLoading(true);setFailed(false);
    try{const response=await fetch('/api/author/books'+(cursor?'?cursor='+encodeURIComponent(cursor):''),{signal:request.signal});if(!response.ok)throw Error();const page=await response.json() as Page;if(!page.actorId||!Array.isArray(page.books))throw Error();setData(previous=>cursor&&previous?.actorId===page.actorId?{...page,books:[...previous.books,...page.books]}:page);}
    catch{if(!request.signal.aborted)setFailed(true);}finally{if(!request.signal.aborted)setLoading(false);}
  },[]);
  useEffect(()=>{void load(null);return()=>controller.current?.abort();},[load]);
  return {data,loading,failed,retry:()=>void load(last.current),more:()=>void load(data?.nextCursor??null)};
}
export function AuthorBookSelect({catalog,value,onChange,required=false}:{catalog:ReturnType<typeof useAuthorBooks>;value:string;onChange:(value:string)=>void;required?:boolean}){
  const t=useTranslations('authorCatalog'),common=useTranslations('common');
  return <div className="space-y-2"><label htmlFor="author-book" className="block text-sm font-medium">{t(required?'book':'optionalBook')}<select id="author-book" required={required} value={value} disabled={catalog.loading||catalog.failed} onChange={event=>onChange(event.target.value)} className="mt-1 block w-full rounded-lg border bg-background px-3 py-2"><option value="">{t('selectBook')}</option>{catalog.data?.books.map(book=><option key={book.id} value={book.id}>{book.title}{book.isbn_13?' · '+book.isbn_13:''} · {book.language}</option>)}</select></label>
    {catalog.loading&&<p role="status" className="text-sm text-muted-foreground">{common('loading')}</p>}
    {catalog.failed&&<p role="alert" className="text-sm text-destructive">{t('loadBooksFailed')} <button type="button" onClick={catalog.retry} className="underline">{common('retry')}</button></p>}
    {!catalog.loading&&!catalog.failed&&!catalog.data?.books.length&&<p className="text-sm text-muted-foreground">{t('approvalRequired')}</p>}
    {catalog.data?.nextCursor&&<button type="button" disabled={catalog.loading} onClick={catalog.more} className="underline text-sm">{common('loadMore')}</button>}
  </div>;
}

'use client';
import {useState} from 'react';
import {useRouter} from 'next/navigation';
import {useTranslations} from 'next-intl';
import {useRequestIntent} from '@/lib/client/useRequestIntent';
import {AuthorBookSelect,useAuthorBooks} from '@/components/author/AuthorBookSelect';
export default function NewAuthorPostPage(){
  const router=useRouter(),t=useTranslations('authorCatalog'),common=useTranslations('common'),catalog=useAuthorBooks(),intent=useRequestIntent(catalog.data?.actorId),[pending,setPending]=useState(false),[failed,setFailed]=useState(false),[form,setForm]=useState({title:'',body:'',book_id:'',type:'blog' as 'announcement'|'blog'|'arc_invite'});
  async function submit(event:React.FormEvent){
    event.preventDefault();if(pending||!catalog.data)return;setPending(true);setFailed(false);
    const body={title:form.title.trim(),body:form.body.trim(),type:form.type,...(form.book_id?{book_id:form.book_id}:{})};
    try{const response=await fetch('/api/author/posts',{method:'POST',headers:{'Content-Type':'application/json',...await intent.durableHeaders(body,'author.post')},body:JSON.stringify(body)}),receipt=await response.json();if(!response.ok||!receipt.post?.id||receipt.post.author_id!==catalog.data.actorId)throw Error();intent.complete('author.post');router.push('/profile');router.refresh();}catch{setFailed(true);}finally{setPending(false);}
  }
  return <div className="max-w-xl mx-auto px-4 py-8"><h1 className="font-display text-2xl font-bold mb-6">{t('createPost')}</h1><form onSubmit={submit} className="space-y-5"><fieldset disabled={pending} className="space-y-5">
    <label htmlFor="author-post-type" className="block text-sm font-medium">{t('postType')}<select id="author-post-type" value={form.type} onChange={event=>setForm({...form,type:event.target.value as typeof form.type})} className="mt-1 block w-full rounded-lg border bg-background px-3 py-2">{(['blog','announcement','arc_invite'] as const).map(type=><option key={type} value={type}>{t(type)}</option>)}</select></label>
    <label htmlFor="author-post-title" className="block text-sm font-medium">{t('title')}<input id="author-post-title" required minLength={1} maxLength={200} value={form.title} onChange={event=>setForm({...form,title:event.target.value})} className="block mt-1 w-full rounded-lg border bg-background px-3 py-2"/></label>
    <label htmlFor="author-post-body" className="block text-sm font-medium">{t('content')}<textarea id="author-post-body" required rows={8} minLength={1} maxLength={2000} value={form.body} onChange={event=>setForm({...form,body:event.target.value})} className="block mt-1 w-full rounded-lg border bg-background px-3 py-2"/></label>
    <AuthorBookSelect catalog={catalog} value={form.book_id} onChange={book_id=>setForm({...form,book_id})} required={form.type==='arc_invite'}/>
    </fieldset>{failed&&<p role="alert" className="text-sm text-destructive">{t('saveFailed')}</p>}<button type="submit" disabled={pending||catalog.loading||catalog.failed||!catalog.data||!form.title.trim()||!form.body.trim()||(form.type==='arc_invite'&&!form.book_id)} className="w-full px-4 py-2 rounded-lg bg-accent text-white font-semibold disabled:opacity-50">{pending?common('saving'):t('publishPost')}</button></form></div>;
}

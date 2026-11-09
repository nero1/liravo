import Link from 'next/link';
import {getTranslations} from 'next-intl/server';
import {redirect} from 'next/navigation';
import {getCurrentUser} from '@/lib/auth/getCurrentUser';
import {getReadingLists} from '@/lib/reading-lists';
import {languageAlternates} from '@/lib/metadata';
import {RefreshButton} from '@/components/layout/RefreshButton';
export const dynamic='force-dynamic';
export async function generateMetadata(){const t=await getTranslations('readingLists');return {title:t('title'),description:t('description'),alternates:languageAlternates('/lists')};}
export default async function Page(props:{searchParams?: Promise<{cursor?:string;followedCursor?:string}>}) {
  const searchParams = (await props.searchParams)??{};
  const user=await getCurrentUser();if(!user)redirect('/login');const t=await getTranslations('readingLists'),common=await getTranslations('common');let pages;
  try{pages=await Promise.all([getReadingLists(user.id,'mine',searchParams?.cursor??null),getReadingLists(user.id,'followed',searchParams?.followedCursor??null)]);}catch{return <div className="max-w-2xl mx-auto p-8"><h1 className="text-2xl font-bold">{t('title')}</h1><p role="alert">{t('loadFailed')} <RefreshButton/></p></div>;}
  return <div className="max-w-2xl mx-auto px-4 py-8 space-y-6"><div className="flex items-center justify-between gap-3"><h1 className="font-display text-2xl font-bold">{t('title')}</h1><Link href="/lists/new" className="underline">{t('create')}</Link></div><p className="text-muted-foreground">{t('description')}</p>{pages.map((page,index)=><section key={index} id={index?'followed-lists':'my-lists'} className="space-y-3"><h2 className="text-lg font-semibold">{t(index?'followed':'mine')}</h2>{!page.lists.length&&<p>{t('empty')}</p>}{page.lists.map(list=><article key={list.id} className="rounded-xl border p-4 space-y-2"><h3 className="font-semibold"><Link href={'/lists/'+list.id}>{list.name}</Link></h3>{list.description&&<p className="text-sm text-muted-foreground">{list.description}</p>}<p className="text-sm text-muted-foreground">{t('books',{count:list.book_count})} · {t('followers',{count:list.follower_count})} · {t(list.is_public?'publicLabel':'private')}</p></article>)}{page.nextCursor&&<Link href={'/lists?'+new URLSearchParams({...searchParams,[index?'followedCursor':'cursor']:page.nextCursor})+(index?'#followed-lists':'#my-lists')} className="underline">{common('loadMore')}</Link>}{(index?searchParams?.followedCursor:searchParams?.cursor)&&<Link href="/lists" className="block underline">{t('refresh')}</Link>}</section>)}</div>;
}

import {getCurrentUser} from '@/lib/auth/getCurrentUser';
import {getSocialFeed,FeedCursorError} from '@/lib/social-feed';
import {getTranslations,getFormatter} from 'next-intl/server';
import {ReactionButtons} from '@/components/books/ReactionButtons';
import {redirect} from 'next/navigation';
import Image from 'next/image';
import Link from 'next/link';
import type {Metadata} from 'next';

export const dynamic='force-dynamic';
export async function generateMetadata():Promise<Metadata>{return {title:(await getTranslations('feed'))('title'),robots:{index:false}};}
export default async function FeedPage({searchParams}:{searchParams:{cursor?:string}}){
  const user=await getCurrentUser();if(!user)redirect('/login');const t=await getTranslations('feed'),formatter=await getFormatter();let feed;
  try{feed=await getSocialFeed(user.id,searchParams.cursor);}catch(error){return <div className="max-w-2xl mx-auto p-6"><p role="alert">{t(error instanceof FeedCursorError?'invalidCursor':'unavailable')}</p><Link href="/feed" className="underline">{t('retry')}</Link></div>;}
  return <div className="max-w-2xl mx-auto px-4 py-6 space-y-6"><h1 className="font-display text-2xl font-bold">{t('title')}</h1>{feed.items.length===0?<div className="text-center py-12 text-muted-foreground"><p>{t('empty')}</p><Link href="/discover" className="underline">{t('discover')}</Link></div>:feed.items.map(item=><article key={item.id} className="border border-border rounded-xl p-4 space-y-3">
    <div className="flex items-center gap-3">{item.user.avatar_url&&<Image src={item.user.avatar_url} alt="" width={32} height={32} className="rounded-full object-cover"/>}<div><Link href={`/user/${item.user.username}`} className="font-medium hover:text-accent">{item.user.display_name??item.user.username}</Link><p className="text-sm text-muted-foreground">{t(item.type==='review'?'reviewed':item.finishedAt?'finished':item.shelf.default_type==='currently_reading'?'started':item.shelf.default_type==='want_to_read'?'wants':'shelved',{shelf:item.type==='shelf_book'?item.shelf.name:''})}</p></div><time dateTime={item.timestamp} className="ml-auto text-xs text-muted-foreground">{formatter.relativeTime(new Date(item.timestamp))}</time></div>
    <Link href={`/book/${item.book.id}`} className="flex items-center gap-3">{item.book.cover_url&&<Image src={item.book.cover_url} alt="" width={48} height={72} className="rounded object-cover"/>}<div><p className="font-semibold">{item.book.title}</p><p className="text-sm text-muted-foreground">{item.book.author_name}</p></div></Link>
    {item.type==='review'&&<><p className="text-sm text-muted-foreground">{t('rating',{rating:item.rating})}</p>{item.excerpt&&(item.hasSpoilers?<details><summary className="cursor-pointer text-sm text-accent">{t('spoilers')}</summary><p className="text-sm mt-2">{item.excerpt}</p></details>:<p className="text-sm">{item.excerpt}</p>)}<ReactionButtons bookId={item.book.id} reviewId={item.reviewId} userId={user.id} initialWantToRead={item.wantToRead}/></>}
  </article>)}{feed.nextCursor&&<Link href={`/feed?cursor=${encodeURIComponent(feed.nextCursor)}`} className="block text-center underline">{t('more')}</Link>}</div>;
}

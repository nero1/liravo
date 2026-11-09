import {getCurrentUser} from '@/lib/auth/getCurrentUser';
import {getSocialFeed,FeedCursorError} from '@/lib/social-feed';
import {getTranslations} from 'next-intl/server';
import {SocialFeedCard} from '@/components/books/SocialFeedCard';
import {redirect} from 'next/navigation';
import Link from 'next/link';
import type {Metadata} from 'next';

export const dynamic='force-dynamic';
export async function generateMetadata():Promise<Metadata>{return {title:(await getTranslations('feed'))('title'),robots:{index:false}};}
export default async function FeedPage(props:{searchParams: Promise<{cursor?:string}>}) {
  const searchParams = (await props.searchParams)??{};
  const user=await getCurrentUser();if(!user)redirect('/login');const t=await getTranslations('feed');let feed;
  try{feed=await getSocialFeed(user.id,searchParams.cursor);}catch(error){return <div className="max-w-2xl mx-auto p-6"><p role="alert">{t(error instanceof FeedCursorError?'invalidCursor':'unavailable')}</p><Link href="/feed" className="underline">{t('retry')}</Link></div>;}
  return <div className="max-w-2xl mx-auto px-4 py-6 space-y-6"><h1 className="font-display text-2xl font-bold">{t('title')}</h1>{feed.items.length===0?<div className="text-center py-12 text-muted-foreground"><p>{t('empty')}</p><Link href="/discover" className="underline">{t('discover')}</Link></div>:feed.items.map(item=><SocialFeedCard key={item.id} item={item} userId={user.id}/>)}{feed.nextCursor&&<Link href={`/feed?cursor=${encodeURIComponent(feed.nextCursor)}`} className="block text-center underline">{t('more')}</Link>}</div>;
}

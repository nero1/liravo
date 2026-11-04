import {getCurrentUser} from '@/lib/auth/getCurrentUser';
import {createServiceClient} from '@/lib/supabase/server';
import {getSocialFeed} from '@/lib/social-feed';
import {getTrendingBooks} from '@/lib/discovery';
import {SocialFeedCard} from '@/components/books/SocialFeedCard';
import {getTranslations} from 'next-intl/server';
import {redirect} from 'next/navigation';
import Link from 'next/link';
import Image from 'next/image';
export const dynamic='force-dynamic';
export async function generateMetadata(){return{title:(await getTranslations('home'))('title'),robots:{index:false,follow:false}};}
export default async function HomePage(){
 const user=await getCurrentUser();if(!user)redirect('/login');const t=await getTranslations('home'),common=await getTranslations('common');
 const{data:profile,error}=await createServiceClient().from('users').select('onboarding_complete,display_name,xp,reading_streak,books_read_count').eq('id',user.id).single();
 if(error||!profile)return <div className="max-w-2xl mx-auto px-4 py-6 space-y-3"><h1 className="font-display text-2xl font-bold">{t('title')}</h1><p role="alert">{t('loadFailed')}</p><Link href="/" className="underline">{common('retry')}</Link></div>;
 if(!profile.onboarding_complete)redirect('/onboarding');
 const[feed,trending]=await Promise.allSettled([getSocialFeed(user.id),getTrendingBooks()]);
 return <div className="max-w-2xl mx-auto px-4 py-6 space-y-8"><div><h1 className="font-display text-2xl font-bold">{t('welcome',{name:profile.display_name??t('reader')})}</h1><div className="flex items-center gap-4 mt-2 text-sm text-muted-foreground"><span>📚 {t('booksRead',{count:profile.books_read_count??0})}</span><span>🔥 {t('streak',{count:profile.reading_streak??0})}</span><span>⭐ {t('xp',{count:profile.xp??0})}</span></div></div>
 <section id="home-feed" className="space-y-3"><h2 className="font-semibold text-sm text-muted-foreground uppercase tracking-wide">{t('activity')}</h2>{feed.status==='rejected'?<p role="alert">{t('feedFailed')} <Link href="/" className="underline">{common('retry')}</Link></p>:feed.value.items.length?feed.value.items.slice(0,10).map(item=><SocialFeedCard key={item.id} item={item} userId={user.id}/>):<div className="text-center py-10 border border-dashed border-border rounded-xl"><p className="text-4xl mb-3" aria-hidden="true">👋</p><p className="font-medium mb-1">{t('empty')}</p><p className="text-sm text-muted-foreground mb-4">{t('followReaders')}</p><Link href="/discover" className="px-4 py-2 bg-accent text-accent-foreground rounded-lg text-sm font-medium">{t('discover')}</Link></div>}<Link href="/feed" className="block text-sm text-accent hover:underline text-center">{t('fullFeed')}</Link></section>
 {(trending.status==='rejected'||trending.value.length>0)&&<section id="home-trending"><h2 className="font-semibold text-sm text-muted-foreground uppercase tracking-wide mb-3">{t('trending')}</h2>{trending.status==='rejected'?<p role="alert">{t('trendingFailed')} <Link href="/" className="underline">{common('retry')}</Link></p>:<div className="grid grid-cols-3 gap-3">{trending.value.slice(0,6).map(({book,count})=><Link key={book.id} href={'/book/'+book.id} className="group"><div className="aspect-[2/3] relative bg-muted rounded-lg overflow-hidden mb-1.5">{book.cover_url?<Image src={book.cover_url} alt={book.title} fill sizes="120px" className="object-cover group-hover:scale-105 transition-transform"/>:<div className="w-full h-full flex items-center justify-center p-2"><span className="text-[9px] text-center text-muted-foreground">{book.title.slice(0,20)}</span></div>}</div><p className="text-xs font-medium truncate">{book.title}</p><p className="text-[10px] text-muted-foreground">{t('shelvedBy',{count})}</p></Link>)}</div>}</section>}
 <section className="grid grid-cols-2 gap-3"><Link href="/shelf" className="p-4 border border-border rounded-xl hover:bg-muted"><p className="text-xl mb-1" aria-hidden="true">📚</p><p className="font-medium text-sm">{t('shelf')}</p><p className="text-xs text-muted-foreground">{t('trackReading')}</p></Link><Link href="/challenges" className="p-4 border border-border rounded-xl hover:bg-muted"><p className="text-xl mb-1" aria-hidden="true">🏆</p><p className="font-medium text-sm">{t('challenges')}</p><p className="text-xs text-muted-foreground">{t('joinChallenge')}</p></Link></section></div>;
}

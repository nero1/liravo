import {getTranslations,getFormatter} from 'next-intl/server';
import {getCurrentUser} from '@/lib/auth/getCurrentUser';
import {hasPremiumAccess} from '@/lib/premium-access';
import {getReadingYear} from '@/lib/reading-statistics';
import {languageAlternates} from '@/lib/metadata';
import {redirect} from 'next/navigation';
import Link from 'next/link';
import {RefreshButton} from '@/components/layout/RefreshButton';
export const dynamic='force-dynamic';
export async function generateMetadata(){const t=await getTranslations('readingStatistics');return {title:t('title'),alternates:languageAlternates('/stats')};}
export default async function StatsPage(){
  const user=await getCurrentUser();if(!user)redirect('/login');
  const t=await getTranslations('readingStatistics'),format=await getFormatter(),genres=await getTranslations('aiProfiles');
  let snapshot=null,premium:boolean|null=null;try{premium=await hasPremiumAccess(user.id);if(premium)snapshot=await getReadingYear(user.id);}catch{}
  const stats=snapshot?.stats,genre=stats?.favouriteGenre,genreLabel=genre?(genres.has('genreLabels.'+genre)?genres('genreLabels.'+genre):genre):'—';
  const cards=stats?[
    {label:t('books',{year:stats.year}),value:format.number(stats.booksReadThisYear)},
    {label:t('pages'),value:format.number(stats.pagesReadThisYear)},
    {label:t('rating'),value:stats.reviewsWrittenThisYear?format.number(stats.averageRating,{maximumFractionDigits:2})+' ★':'—'},
    {label:t('pace'),value:t('paceValue',{count:format.number(stats.readingPace,{maximumFractionDigits:2})})},
    {label:t('genre'),value:genreLabel},
    {label:t('longest'),value:stats.longestBook?stats.longestBook.title+' · '+t('pageCount',{count:stats.longestBook.page_count}):'—'},
    {label:t('currentStreak'),value:t('days',{count:stats.currentReadingStreak})},
    {label:t('maximumStreak'),value:t('days',{count:stats.readingStreakMax})},
    {label:t('reviews'),value:format.number(stats.reviewsWrittenThisYear)},
    {label:t('quotes'),value:format.number(stats.quotesSavedThisYear)},
  ]:[];
  return <div className="max-w-2xl mx-auto px-4 py-6 space-y-6"><h1 className="font-display text-2xl font-bold">{t('title')}</h1>{premium===false?<div className="space-y-4"><p className="text-muted-foreground">{t('premiumRequired')}</p><Link href="/premium" className="inline-block rounded-lg bg-accent text-white px-4 py-2">{t('premiumLink')}</Link></div>:!stats?<p role="alert" className="text-destructive">{t('failed')} <RefreshButton/></p>:<><div className="grid grid-cols-2 sm:grid-cols-3 gap-4">{cards.map(card=><div key={card.label} className="rounded-xl border border-border bg-card p-4"><p className="text-xs text-muted-foreground mb-1">{card.label}</p><p className="font-bold text-lg leading-tight">{card.value}</p></div>)}</div>{stats.goal.goal&&<div className="rounded-xl border border-border bg-card p-4"><h2 className="font-semibold">{t('goal')}</h2><p>{t('goalProgress',{count:stats.goal.progress.books_read,target:stats.goal.goal.target_books})}</p><p>{t('percentage',{count:stats.goal.progress.percentage??0})}</p></div>}</>}</div>;
}

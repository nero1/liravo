import {getTranslations,getFormatter} from 'next-intl/server';
import {getCurrentUser} from '@/lib/auth/getCurrentUser';
import {getWritingProgress} from '@/lib/writing-progress';
import {BADGE_DEFINITIONS} from '@/services/badges';
import {languageAlternates} from '@/lib/metadata';
import {redirect} from 'next/navigation';
import Link from 'next/link';

export const dynamic='force-dynamic';
export async function generateMetadata(){const t=await getTranslations('nativeWriting');return {title:t('progressTitle'),alternates:languageAlternates('/write/progress')};}

export default async function WritingProgressPage(){
  const user=await getCurrentUser();if(!user)redirect('/login');
  const [progress,t,writing,badgeNames,format]=await Promise.all([getWritingProgress(user.id),getTranslations('writingProgress'),getTranslations('writing'),getTranslations('badges'),getFormatter()]);
  const maxWeekWords=Math.max(...progress.weekly_words.map(week=>week.words),1);
  const badges=BADGE_DEFINITIONS.filter(badge=>['first_draft','workshop_regular','prompt_runner','craft_scholar','writing_streak_7','writing_streak_30','first_prompt','prolific_writer'].includes(badge.id));
  return <div className="max-w-2xl mx-auto px-4 py-6">
    <div className="flex items-center justify-between mb-6"><div><h1 className="font-display text-2xl font-bold">{t('title')}</h1><p className="text-muted-foreground text-sm mt-0.5">{t('description')}</p></div><Link href="/write" className="text-sm text-muted-foreground hover:text-foreground">{writing('writeHub')}</Link></div>
    <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 mb-8">
      {[
        {key:'words',label:t('words'),value:format.number(progress.total_words)},
        {key:'prompts',label:t('prompts'),value:format.number(progress.prompts_completed)},
        {key:'challenges',label:t('challenges'),value:format.number(progress.challenges_completed)},
        {key:'critiques',label:t('critiques'),value:format.number(progress.workshop_critiques)},
        {key:'streak',label:t('streak'),value:t('days',{count:progress.writing_streak})},
        {key:'xp',label:t('xp'),value:format.number(progress.xp)},
      ].map(stat=><div key={stat.key} data-stat={stat.key} className="rounded-xl bg-muted px-4 py-3 text-center"><p className="text-2xl font-bold text-amber-700 dark:text-amber-400">{stat.value}</p><p className="text-xs text-muted-foreground mt-0.5">{stat.label}</p></div>)}
    </div>
    <section className="mb-8"><h2 className="font-semibold mb-3">{t('weekly')}</h2><p className="text-xs text-muted-foreground mb-3">{t('weeklyPeriod')}</p><div className="rounded-xl border bg-card p-5">
      <div className="flex items-end gap-2 h-40" role="list" aria-label={t('weekly')}>
        {progress.weekly_words.map(week=>{const label=format.dateTime(new Date(week.week_start+'T00:00:00Z'),{month:'short',day:'numeric',timeZone:'UTC'});return <div role="listitem" aria-label={t('weekWords',{date:label,count:week.words})} key={week.week_start} className="flex-1 flex flex-col h-full items-center justify-end gap-1"><span className="text-xs text-muted-foreground">{format.number(week.words)}</span><div aria-hidden="true" className="w-full rounded-t bg-amber-400 dark:bg-amber-600 shrink-0" style={{height:`${week.words/maxWeekWords*100}px`}}/><span className="text-xs text-muted-foreground whitespace-nowrap">{label}</span></div>;})}
      </div>
    </div></section>
    <section><h2 className="font-semibold mb-3">{t('badges')}</h2><div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
      {badges.map(badge=>{const earned=progress.badges.find(row=>row.badge_id===badge.id);return <div key={badge.id} data-badge={badge.id} className={`rounded-xl border p-4 text-center ${earned?'opacity-100':'opacity-40'}`}><p className="text-2xl mb-1" aria-hidden="true">{badge.icon}</p><p className="text-sm font-medium">{badgeNames(badge.id)}</p><p className="text-xs text-muted-foreground mt-0.5">{earned?format.dateTime(new Date(earned.awarded_at),{year:'numeric',month:'short',day:'numeric',timeZone:'UTC'}):t('unearned')}</p></div>;})}
    </div></section>
  </div>;
}

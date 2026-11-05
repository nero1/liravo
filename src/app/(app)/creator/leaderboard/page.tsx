import Image from 'next/image';
import Link from 'next/link';
import {getTranslations,getFormatter} from 'next-intl/server';
import {getCreatorLeaderboard} from '@/lib/creator-analytics';
import type {Metadata} from 'next';

export const dynamic='force-dynamic';
export async function generateMetadata():Promise<Metadata>{return {title:(await getTranslations('creator'))('leaderboard')};}
export default async function CreatorLeaderboardPage(){
  const t=await getTranslations('creator'),formatter=await getFormatter();let result;
  try{result=await getCreatorLeaderboard();}catch{return <p role="alert">{t('unavailable')}</p>;}
  return <div className="max-w-2xl mx-auto px-4 py-8">
    <div className="mb-6"><h1 className="font-display text-2xl font-bold">{t('leaderboard')}</h1><p className="text-muted-foreground text-sm mt-1">{t('weeklyDescription',{date:formatter.dateTime(new Date(result.week_start),{dateStyle:'medium',timeZone:'UTC'})})}</p></div>
    {result.leaderboard.length===0?<p className="text-muted-foreground">{t('empty')}</p>:<div className="overflow-x-auto rounded-xl border border-border"><table className="w-full text-sm"><caption className="sr-only">{t('leaderboard')}</caption><thead className="bg-muted"><tr><th scope="col" className="p-4 text-left">{t('rank')}</th><th scope="col" className="p-4 text-left">{t('creator')}</th><th scope="col" className="p-4 text-right">{t('weeklyConversions')}</th></tr></thead><tbody className="divide-y divide-border">
      {result.leaderboard.map((entry,index)=><tr key={entry.user_id}><td className="p-4">{formatter.number(index+1)}</td><td className="p-4"><div className="flex items-center gap-3">{entry.avatar_url?<Image src={entry.avatar_url} alt="" width={32} height={32} className="rounded-full object-cover"/>:<span aria-hidden="true" className="w-8 h-8 rounded-full bg-accent flex items-center justify-center">{(entry.display_name??entry.username)[0]}</span>}<div><Link href={`/user/${entry.username}`} className="font-medium hover:text-accent">{entry.display_name??entry.username}</Link>{entry.is_verified_author&&<p className="text-xs text-accent">{t('verifiedAuthor')}</p>}</div></div></td><td className="p-4 text-right font-semibold text-accent">{formatter.number(entry.want_to_read_score)}</td></tr>)}
    </tbody></table></div>}
  </div>;
}

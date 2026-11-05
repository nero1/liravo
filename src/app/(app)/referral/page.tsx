import {getTranslations,getFormatter} from 'next-intl/server';
import {getCurrentUser} from '@/lib/auth/getCurrentUser';
import {getReferralStatistics} from '@/services/referrals';
import {APP_URL} from '@/constants/config';
import {languageAlternates} from '@/lib/metadata';
import {redirect} from 'next/navigation';
import Link from 'next/link';
export const dynamic='force-dynamic';
export async function generateMetadata(){const t=await getTranslations('referrals');return {title:t('title'),alternates:languageAlternates('/referral')};}
export default async function ReferralPage(){
  const user=await getCurrentUser();if(!user)redirect('/login');
  const [stats,t,format,badges]=await Promise.all([getReferralStatistics(user.id),getTranslations('referrals'),getFormatter(),getTranslations('badges')]);
  const link=new URL('/?ref='+encodeURIComponent(stats.referralCode??''),APP_URL).href;
  return <div className="max-w-2xl mx-auto px-4 py-6 space-y-6">
    <h1 className="font-display text-2xl font-bold">{t('title')}</h1>
    <section className="border border-border rounded-xl p-4 space-y-2"><h2 className="font-semibold">{t('code')}</h2><p className="text-xl font-bold text-accent">{stats.referralCode}</p><p className="text-sm break-all">{link}</p><p className="text-sm text-muted-foreground">{t('terms')}</p></section>
    <section className="border border-border rounded-xl p-4 space-y-2"><h2 className="font-semibold">{t('count')}</h2><p className="text-2xl font-bold">{format.number(stats.referralCount)}</p><p>{t('xp',{count:stats.xpFromReferrals})}</p></section>
    <section className="border border-border rounded-xl p-4 space-y-2"><h2 className="font-semibold">{t('earned')}</h2>{Object.keys(stats.earnedByCurrency).length?Object.entries(stats.earnedByCurrency).map(([currency,amount])=><p key={currency}>{format.number(Number(amount),{style:'currency',currency,minimumFractionDigits:2,maximumFractionDigits:4})}</p>):<p className="text-muted-foreground">{t('noEarnings')}</p>}</section>
    <section><h2 className="font-display text-lg font-bold mb-3">{t('milestones')}</h2><ul className="space-y-2">{stats.milestones.map(milestone=><li key={milestone.id} className="border border-border rounded-lg p-3"><p className="font-semibold">{badges(milestone.labelKey)}</p><p className="text-sm text-muted-foreground">{t('milestone',{target:milestone.target,xp:milestone.xp})} · {t(milestone.earned?'badgeEarned':'badgePending')}</p></li>)}</ul></section>
    <section><h2 className="font-display text-lg font-bold mb-3">{t('leaderboard')}</h2>{stats.topReferrers.length?<ol className="space-y-2">{stats.topReferrers.map(person=><li key={person.id} className="border border-border rounded-lg p-3 flex justify-between gap-3"><Link href={'/user/'+person.username} className="hover:underline">{person.display_name}</Link><span>{format.number(person.count)}</span></li>)}</ol>:<p className="text-muted-foreground">{t('emptyLeaderboard')}</p>}</section>
  </div>;
}

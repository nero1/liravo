import {redirect} from 'next/navigation';
import Link from 'next/link';
import {getTranslations} from 'next-intl/server';
import {getCurrentUser} from '@/lib/auth/getCurrentUser';
import {isModerator} from '@/lib/moderation';
import {readModerationDashboard} from '@/lib/moderation-reader';
export const dynamic='force-dynamic';
export default async function ModerationPage(){
  const user=await getCurrentUser();if(!user||!await isModerator(user.id))redirect('/');const t=await getTranslations('moderation');
  let data;try{data=await readModerationDashboard(user.id);}catch{}
  return <div className="max-w-4xl mx-auto p-6"><h1 className="text-2xl font-bold mb-6">{t('dashboard')}</h1>{!data?<p role="alert">{t('unavailable')} <Link href="/moderation">{t('retry')}</Link></p>:<><div className="grid grid-cols-2 gap-4 mb-8">{(['pending','today']as const).map(key=><div key={key} className="bg-card border border-border rounded-xl p-5"><p className="text-sm text-muted-foreground">{t(key+'Count')}</p><p className="text-3xl font-bold">{data[key]}</p></div>)}</div><div className="flex flex-col gap-3">{(['reviews','reports','appeals',...data.isAdmin?['log']:[]]as const).map(key=><Link key={key} href={'/moderation/'+key} className="block bg-card border border-border rounded-xl p-5 hover:bg-muted"><p className="font-semibold text-lg">{t(key==='reviews'?'pendingReviews':key)}</p><p className="text-sm text-muted-foreground mt-1">{t(key==='reviews'?'pendingReviewDescription':key==='reports'?'queueDescription':key==='appeals'?'appealDescription':'logDescription')}</p></Link>)}</div></>}</div>;
}

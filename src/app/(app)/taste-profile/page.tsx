import { CsrfInput } from '@/components/layout/CsrfInput';
import { getCurrentUser } from '@/lib/auth/getCurrentUser';
import { AIProfileError,readTasteProfile } from '@/services/ai-profiles';
import { getTranslations,getFormatter } from 'next-intl/server';
import { redirect } from 'next/navigation';
import Link from 'next/link';

export const dynamic='force-dynamic';
export async function generateMetadata(){const t=await getTranslations('aiProfiles');return {title:t('tasteTitle')};}
export default async function TasteProfilePage({searchParams}:{searchParams:{error?:string}}){
  const user=await getCurrentUser();if(!user)redirect('/login');
  const t=await getTranslations('aiProfiles'),moods=await getTranslations('moods'),format=await getFormatter();
  const genre=(value:string)=>t.has('genreLabels.'+value)?t('genreLabels.'+value):value,mood=(value:string)=>moods.has(value)?moods(value):value;
  let data:Awaited<ReturnType<typeof readTasteProfile>>|undefined,error:string|undefined;
  try{data=await readTasteProfile(user.id);}catch(problem){error=problem instanceof AIProfileError?problem.code:'unavailable';}
  const code=searchParams.error??error;
  const message=code&&['premiumRequired','insufficientHistory','busy','changed','unavailable'].includes(code)?t(code as 'unavailable'):null;
  return <div className="max-w-2xl mx-auto px-4 py-6 space-y-5">
    <h1 className="font-display text-2xl font-bold">{t('tasteTitle')}</h1>
    {message&&<p role="alert" className="text-sm text-muted-foreground">{message}</p>}
    {error==='premiumRequired'?<Link href="/premium" className="text-accent underline">{t('premium')}</Link>:<>
      {data?.profile?<div className="rounded-xl border border-border bg-card p-6 space-y-4">
        <p className="leading-relaxed">{data.profile.summary}</p>
        {data.profile.top_genres.length>0&&<p><strong>{t('genres')}: </strong>{data.profile.top_genres.map(genre).join(', ')}</p>}
        {data.profile.mood_preferences.length>0&&<p><strong>{t('moods')}: </strong>{data.profile.mood_preferences.map(mood).join(', ')}</p>}
        {data.generatedAt&&<p className="text-xs text-muted-foreground">{t('generated',{date:format.dateTime(new Date(data.generatedAt),{dateStyle:'long'})})}</p>}
      </div>:<p className="text-muted-foreground">{data?.eligible===false?t('insufficientHistory'):t('noTaste')}</p>}
      <form action="/api/ai/taste-profile" method="POST"><CsrfInput /><button disabled={data?.eligible===false} className="px-4 py-2 rounded-lg bg-accent text-accent-foreground disabled:opacity-50">{data?.profile?t('refresh'):t('generate')}</button></form>
    </>}
  </div>;
}

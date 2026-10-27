import { CsrfInput } from '@/components/layout/CsrfInput';
import { getCurrentUser } from '@/lib/auth/getCurrentUser';
import { AIProfileError,readWritingPlan,writingWeekStart } from '@/services/ai-profiles';
import { getTranslations,getFormatter } from 'next-intl/server';
import { redirect } from 'next/navigation';
import Link from 'next/link';

export const dynamic='force-dynamic';
export async function generateMetadata(){const t=await getTranslations('aiProfiles');return {title:t('planTitle')};}
export default async function MyWritingPlanPage({searchParams}:{searchParams:{error?:string}}){
  const user=await getCurrentUser();if(!user)redirect('/login');
  const t=await getTranslations('aiProfiles'),format=await getFormatter();
  let data:Awaited<ReturnType<typeof readWritingPlan>>|undefined,error:string|undefined;
  try{data=await readWritingPlan(user.id);}catch(problem){error=problem instanceof AIProfileError?problem.code:'unavailable';}
  const code=searchParams.error??error;
  const message=code&&['premiumRequired','busy','changed','unavailable','writerRequired'].includes(code)?t(code as 'unavailable'):null;
  return <div className="max-w-2xl mx-auto px-4 py-6 space-y-5">
    <h1 className="font-display text-2xl font-bold">{t('planTitle')}</h1>
    <p className="text-sm text-muted-foreground">{t('week',{date:format.dateTime(new Date(writingWeekStart()+'T00:00:00Z'),{dateStyle:'long',timeZone:'UTC'})})}</p>
    {message&&<p role="alert" className="text-sm text-muted-foreground">{message}</p>}
    {error==='premiumRequired'?<Link href="/premium" className="text-accent underline">{t('premium')}</Link>:error==='writerRequired'?<Link href="/profile/edit" className="text-accent underline">{t('editProfile')}</Link>:<>
      {data?.plan?data.plan.tasks.map(task=><div key={task.day} className="rounded-xl border bg-card p-5 space-y-2">
        <h2 className="font-semibold">{t(`days.${task.day}`)}</h2><p>{task.task}</p><p className="text-sm text-muted-foreground">{t('goal',{goal:task.goal})}</p>
      </div>):<p className="text-muted-foreground">{t('noPlan')}</p>}
      <form action="/api/write/plan" method="POST"><CsrfInput /><button className="px-4 py-2 rounded-lg bg-accent text-accent-foreground">{data?.plan?t('refresh'):t('generate')}</button></form>
    </>}
  </div>;
}

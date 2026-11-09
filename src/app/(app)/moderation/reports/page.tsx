import {redirect} from 'next/navigation';
import Link from 'next/link';
import {getTranslations,getLocale} from 'next-intl/server';
import {getCurrentUser} from '@/lib/auth/getCurrentUser';
import {isModerator} from '@/lib/moderation';
import {readModeration,reportStatuses} from '@/lib/moderation-reader';
import {ReportActionForm} from '@/components/moderation/ReportActionForm';
import type {ModerationReport} from '@/types/database';
export const dynamic='force-dynamic';
export default async function ModerationReportsPage(
  props:{searchParams: Promise<{status?:string;cursor?:string;page?:string}>}
) {
  const searchParams = (await props.searchParams)??{};
  const user=await getCurrentUser();if(!user||!(await isModerator(user.id)))redirect('/');
  const t=await getTranslations('moderation'),locale=await getLocale(),status=searchParams.status??'pending',url=(cursor?:string)=>'/moderation/reports?'+new URLSearchParams({status,...(cursor ? {cursor} : {})});
  let data;try{data=await readModeration<ModerationReport>(user.id,'reports',{status,cursor:searchParams.cursor??null,page:Number(searchParams.page??'1')});}catch{}
  return <div className="max-w-5xl mx-auto p-6"><Link href="/moderation" className="text-accent hover:underline">{t('title')}</Link><h1 className="text-xl font-bold my-6">{t('reports')}</h1><nav className="flex flex-wrap gap-3 mb-6">{reportStatuses.map(value=><Link key={value} href={'/moderation/reports?status='+value} aria-current={status===value?'page':undefined} className="text-sm text-accent hover:underline">{t('statuses.'+value)}</Link>)}</nav>
    {!data?<p role="alert">{t('unavailable')} <Link href="/moderation/reports" className="text-accent">{t('retry')}</Link></p>:<><p className="mb-4 text-sm text-muted-foreground">{t('entries',{count:data.total})}</p>{data.items.length===0?<p>{t('emptyReports')}</p>:<div className="flex flex-col gap-4">{data.items.map(report=><article key={report.id} className="bg-card border border-border rounded-xl p-4 space-y-2"><p className="text-sm text-muted-foreground">{t('entities.'+report.entity_type)} · {t('statuses.'+report.status)} · {new Date(report.created_at).toLocaleString(locale)}</p><p className="text-sm">{t('reporter',{name:report.reporter.display_name+' (@'+report.reporter.username+')'})}</p><h2 className="font-semibold">{report.target.label??t('unknown')}</h2>{report.target.username&&<p className="text-sm text-muted-foreground">@{report.target.username}</p>}{report.target.content&&<p className="text-sm whitespace-pre-wrap break-words">{report.target.content}</p>}<p className="text-sm break-words">{t('reason')}: {report.reason}</p>{report.moderator_note&&<p className="text-sm break-words">{t('note')}: {report.moderator_note}</p>}{report.moderator&&<p className="text-xs text-muted-foreground">{t('moderator',{name:report.moderator.display_name})}</p>}<ReportActionForm reportId={report.id} userId={user.id} allowedActions={report.allowed_actions} entityType={report.entity_type}/></article>)}</div>}<nav className="mt-6 flex gap-4">{(searchParams.cursor||Number(searchParams.page)>1)&&<Link href={url()} className="text-accent">{t('first')}</Link>}{data.nextCursor&&<Link href={url(data.nextCursor)} className="text-accent">{t('next')}</Link>}</nav></>}
  </div>;
}

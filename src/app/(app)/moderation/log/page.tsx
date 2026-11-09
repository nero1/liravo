import {redirect} from 'next/navigation';
import Link from 'next/link';
import {getTranslations,getLocale} from 'next-intl/server';
import {getCurrentUser} from '@/lib/auth/getCurrentUser';
import {isAdmin} from '@/lib/moderation';
import {readModeration} from '@/lib/moderation-reader';
import type {ModerationLog} from '@/types/database';
export const dynamic='force-dynamic';
export default async function ModerationLogPage(props:{searchParams: Promise<{cursor?:string;page?:string}>}) {
  const searchParams = (await props.searchParams)??{};
  const user=await getCurrentUser();if(!user)redirect('/');if(!(await isAdmin(user.id)))redirect('/moderation');
  const t=await getTranslations('moderation'),locale=await getLocale();
  let data;try{data=await readModeration<ModerationLog>(user.id,'log',{cursor:searchParams.cursor??null,page:Number(searchParams.page??'1')});}catch{}
  return <div className="max-w-5xl mx-auto p-6"><Link href="/moderation" className="text-accent">{t('title')}</Link><h1 className="text-xl font-bold my-6">{t('log')}</h1>{!data?<p role="alert">{t('unavailable')} <Link href="/moderation/log" className="text-accent">{t('retry')}</Link></p>:<><p className="mb-4 text-sm text-muted-foreground">{t('entries',{count:data.total})}</p>{data.items.length===0?<p>{t('emptyLog')}</p>:<div className="overflow-x-auto"><table className="w-full text-sm"><thead><tr className="border-b text-left">{['action','moderator','content','reason','date'].map(key=><th key={key} className="p-2">{key==='moderator'?t('moderatorColumn'):t(key)}</th>)}</tr></thead><tbody>{data.items.map(log=><tr key={log.id} className="border-b border-border"><td className="p-2">{t.has('statuses.'+log.action)?t('statuses.'+log.action):t.has('audit.'+log.action)?t('audit.'+log.action):t('otherAction',{action:log.action})}</td><td className="p-2">{log.moderator?log.moderator.display_name+' (@'+log.moderator.username+')':t('unknown')}</td><td className="p-2">{log.entity_type&&t.has('entities.'+log.entity_type)?t('entities.'+log.entity_type):log.entity_type??t('unknown')}{log.target&&' · '+log.target.display_name}</td><td className="p-2 break-words">{log.reason??log.notes??'—'}</td><td className="p-2">{new Date(log.created_at).toLocaleString(locale)}</td></tr>)}</tbody></table></div>}<nav className="mt-6 flex gap-4">{(searchParams.cursor||Number(searchParams.page)>1)&&<Link href="/moderation/log" className="text-accent">{t('first')}</Link>}{data.nextCursor&&<Link href={'/moderation/log?'+new URLSearchParams({cursor:data.nextCursor})} className="text-accent">{t('next')}</Link>}</nav></>}</div>;
}

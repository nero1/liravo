import {getTranslations} from 'next-intl/server';
import {getCurrentUser} from '@/lib/auth/getCurrentUser';
import {redirect,notFound} from 'next/navigation';
import Link from 'next/link';
import {getWorkshopPage} from '@/lib/workshops';
import {decodeCursor} from '@/lib/pagination';
import {languageAlternates} from '@/lib/metadata';
import {WorkshopCreateForm} from '@/components/writing/WorkshopCreateForm';
export const dynamic='force-dynamic';
export async function generateMetadata(){const t=await getTranslations('nativeWriting');return {title:t('workshops'),description:t('workshopDescription'),alternates:languageAlternates('/write/workshops')};}
interface Workshop {id:string;name:string;topic:string|null;member_count:number;max_members:number;facilitator:{display_name:string;username:string}|null;}
export default async function WorkshopsPage({searchParams}:{searchParams?:{cursor?:string}}){
  const user=await getCurrentUser();if(!user)redirect('/login');
  const [t,writing,common]=await Promise.all([getTranslations('nativeWriting'),getTranslations('writing'),getTranslations('common')]);
  let cursor;try{cursor=decodeCursor(searchParams?.cursor??null);}catch{notFound();}
  const {rooms,nextCursor}=await getWorkshopPage(cursor);
  return <div className="max-w-2xl mx-auto px-4 py-6">
    <div className="flex items-center justify-between mb-6"><div><h1 className="font-display text-2xl font-bold">{t('workshops')}</h1><p className="text-muted-foreground text-sm mt-0.5">{t('workshopDescription')}</p></div><Link href="/write" className="text-sm text-muted-foreground hover:text-foreground">{writing('writeHub')}</Link></div>
    <div className="mb-6"><WorkshopCreateForm key={user.id} actorId={user.id}/></div>
    {!rooms.length?<p className="rounded-xl border bg-muted p-8 text-center text-muted-foreground">{t('noWorkshops')}</p>:<div id="workshops" className="space-y-4">{rooms.map((room:Workshop)=><div key={room.id} className="rounded-xl border bg-card p-5 flex items-start gap-4"><div className="flex-1 min-w-0"><h2 className="font-semibold">{room.name}</h2>{room.topic&&<p className="text-sm text-muted-foreground mt-0.5">{room.topic}</p>}<p className="text-xs text-muted-foreground mt-2">{t('memberCapacity',{count:room.member_count,max:room.max_members})}</p>{room.facilitator&&<p className="text-xs text-muted-foreground">{t('facilitator',{name:room.facilitator.display_name})}</p>}</div><div className="flex flex-col gap-2 shrink-0"><Link href={`/write/workshops/${room.id}`} className="rounded-lg border px-3 py-1.5 text-sm hover:bg-muted text-center">{writing('view')}</Link>{room.member_count>=room.max_members&&<span className="text-xs text-muted-foreground text-center">{t('full')}</span>}</div></div>)}</div>}
    {nextCursor&&<Link href={'/write/workshops?cursor='+encodeURIComponent(nextCursor)+'#workshops'} className="inline-block text-sm text-amber-600 mt-4">{common('loadMore')}</Link>}
  </div>;
}

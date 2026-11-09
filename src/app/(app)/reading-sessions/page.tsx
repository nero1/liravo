import Link from 'next/link';
import {redirect,notFound} from 'next/navigation';
import {getTranslations,getFormatter} from 'next-intl/server';
import {z} from 'zod';
import {getCurrentUser} from '@/lib/auth/getCurrentUser';
import {readingSessionPage} from '@/lib/content-history';
import {decodeCursor} from '@/lib/pagination';
import {RefreshButton} from '@/components/layout/RefreshButton';
export default async function ReadingHistory({searchParams}:{searchParams?:{book_id?:string;cursor?:string}}){
 const user=await getCurrentUser();if(!user)redirect('/login');
 const book=searchParams?.book_id??null,cursor=searchParams?.cursor??null;
 try{if(book&&!z.string().uuid().safeParse(book).success)throw Error();decodeCursor(cursor);}catch{notFound();}
 const t=await getTranslations('readingHistory'),common=await getTranslations('common'),format=await getFormatter();
 try{
  const page=await readingSessionPage(user.id,book,cursor);
  return <div className="max-w-2xl mx-auto p-6 space-y-4"><h1 className="font-display text-2xl font-bold">{t('title')}</h1>{!page.sessions.length&&<p>{t('empty')}</p>}{page.sessions.map(session=><article key={session.id} className="rounded-xl border border-border p-4 space-y-2"><Link href={'/book/'+session.book_id} className="text-accent underline">{t('viewBook')}</Link><p>{format.dateTime(new Date(session.created_at),{dateStyle:'medium',timeStyle:'short'})}</p>{session.pages_read!==null&&<p>{t('pages',{count:session.pages_read})}</p>}{session.notes&&<p className="whitespace-pre-wrap">{session.notes}</p>}</article>)}{page.nextCursor&&<Link className="text-accent underline" href={'/reading-sessions?'+new URLSearchParams({...(book?{book_id:book}:{}),cursor:page.nextCursor})}>{common('loadMore')}</Link>}</div>;
 }catch{return <div className="p-6"><p role="alert">{t('failed')}</p><RefreshButton/></div>;}
}

import {getTranslations} from 'next-intl/server';
import {canonicalMood,getMoodBooks,MoodCursorError} from '@/services/discovery';
import {languageAlternates} from '@/lib/metadata';
import Link from 'next/link';
import Image from 'next/image';
import type {Metadata} from 'next';
import {notFound} from 'next/navigation';
export const dynamic='force-dynamic';
interface Props {params:{tag:string};searchParams:{cursor?:string};}
export async function generateMetadata({params}:Props):Promise<Metadata>{
  const mood=canonicalMood(params.tag),t=await getTranslations('discover'),moods=await getTranslations('moods');
  return {title:mood?t('moodBooks',{mood:moods(mood)}):t('moodTitle'),alternates:languageAlternates('/discover/mood/'+encodeURIComponent(params.tag))};
}
export default async function MoodPage({params,searchParams}:Props){
  const mood=canonicalMood(params.tag);if(!mood)notFound();
  const [t,moods,common]=await Promise.all([getTranslations('discover'),getTranslations('moods'),getTranslations('common')]);
  let page;
  try{page=await getMoodBooks(mood,searchParams.cursor??null);}catch(error){if(error instanceof MoodCursorError)notFound();throw error;}
  return <div className="max-w-2xl mx-auto px-4 py-6">
    <Link href="/discover" className="text-sm text-muted-foreground hover:underline mb-2 inline-block">{t('back')}</Link>
    <h1 className="font-display text-2xl font-bold mb-6">{t('moodBooks',{mood:moods(mood)})}</h1>
    {page.books.length===0?<p className="text-muted-foreground py-16 text-center">{t('moodNoBooks')}</p>:<div className="space-y-4">{page.books.map(book=><Link key={book.id} href={'/book/'+book.id} className="flex gap-4 p-3 rounded-lg border border-border hover:bg-muted">
      <div className="relative w-12 h-[72px] shrink-0 overflow-hidden rounded bg-muted">{book.cover_url?<Image src={book.cover_url} alt={book.title} fill sizes="48px" className="object-cover"/>:<span aria-hidden="true">📚</span>}</div>
      <div className="min-w-0"><p className="font-semibold line-clamp-2">{book.title}</p><p className="text-sm text-muted-foreground">{book.author_name}</p><p className="text-xs text-accent">{t('moodReaderCount',{count:book.mood_count})}</p></div>
    </Link>)}</div>}
    {page.nextCursor&&<Link className="inline-block mt-6 text-accent underline" href={'/discover/mood/'+encodeURIComponent(mood)+'?cursor='+encodeURIComponent(page.nextCursor)}>{common('loadMore')}</Link>}
  </div>;
}

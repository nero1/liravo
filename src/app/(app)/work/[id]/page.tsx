import type {Metadata} from 'next';
import {getTranslations,getFormatter} from 'next-intl/server';
import {redirect,notFound} from 'next/navigation';
import {getCurrentUser} from '@/lib/auth/getCurrentUser';
import {getWorkCatalog} from '@/services/books';
import {EditionSelector} from '@/components/books/EditionSelector';
import {languageAlternates} from '@/lib/metadata';
import {z} from 'zod';
export const dynamic='force-dynamic';
export async function generateMetadata({params}:{params:{id:string}}):Promise<Metadata>{
  const t=await getTranslations('editions');
  if(!z.string().uuid().safeParse(params.id).success)return {title:t('workNotFound')};
  const catalog=await getWorkCatalog(params.id);if(!catalog)return {title:t('workNotFound')};
  return {title:catalog.work.title,description:t('workDescription',{title:catalog.work.title,author:catalog.work.author_name}),alternates:languageAlternates('/work/'+catalog.work.id)};
}
export default async function WorkPage({params}:{params:{id:string}}){
  if(!await getCurrentUser())redirect('/login');
  if(!z.string().uuid().safeParse(params.id).success)notFound();
  const catalog=await getWorkCatalog(params.id);if(!catalog)notFound();
  if(catalog.work.id!==params.id)redirect('/work/'+catalog.work.id);
  const t=await getTranslations('editions'),formatter=await getFormatter(),stats=catalog.statistics;
  return <div className="max-w-2xl mx-auto p-4 space-y-6">
    <header><h1 className="font-display text-2xl font-bold">{catalog.work.title}</h1><p className="text-muted-foreground">{catalog.work.author_name}</p></header>
    <p className="text-sm text-muted-foreground">{t('workRatings',{count:stats.ratings_count})}{stats.average_rating!==null?' · '+formatter.number(stats.average_rating,{maximumFractionDigits:2})+'/5':''}</p>
    <EditionSelector catalog={catalog}/>
  </div>;
}

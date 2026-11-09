import {getTranslations} from 'next-intl/server';
import {redirect,notFound} from 'next/navigation';
import {z} from 'zod';
import {getCurrentUser} from '@/lib/auth/getCurrentUser';
import {getReadingDebate,ReadingCatalogError} from '@/lib/reading-discovery';
import {languageAlternates} from '@/lib/metadata';
import {ReadingDebateCard} from '@/components/reading/ReadingCatalogs';
import {RefreshButton} from '@/components/layout/RefreshButton';
import Link from 'next/link';
export const dynamic='force-dynamic';
export async function generateMetadata(props:{params: Promise<{id:string}>}) {
  const params = await props.params;
  const t=await getTranslations('bookDebates');try{if(!z.string().uuid().safeParse(params.id).success)throw Error();const {debate}=await getReadingDebate(null,params.id);return {title:debate.question,alternates:languageAlternates('/debates/'+params.id)};}catch{return {title:t('title'),robots:{index:false,follow:false}};}
}
export default async function Page(props:{params: Promise<{id:string}>}) {
  const params = await props.params;
  const user=await getCurrentUser();if(!user)redirect('/login');if(!z.string().uuid().safeParse(params.id).success)notFound();const t=await getTranslations('bookDebates');
  try{const {debate}=await getReadingDebate(user.id,params.id);return <div className="max-w-2xl mx-auto px-4 py-8 space-y-5"><Link href="/debates" className="text-sm underline">{t('back')}</Link><h1 className="font-display text-2xl font-bold">{t('title')}</h1><ReadingDebateCard key={user.id+':'+debate.id} initial={debate} actorId={user.id} detail/></div>;}catch(error){if(error instanceof ReadingCatalogError&&error.status===404)notFound();return <div className="p-8"><h1 className="text-2xl font-bold">{t('title')}</h1><p role="alert">{t('loadFailed')} <RefreshButton/></p></div>;}
}

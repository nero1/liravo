import {getTranslations} from 'next-intl/server';
import {redirect,notFound} from 'next/navigation';
import {z} from 'zod';
import {getCurrentUser} from '@/lib/auth/getCurrentUser';
import {createServiceClient} from '@/lib/supabase/server';
import {getReadingChallenge,ReadingCatalogError} from '@/lib/reading-discovery';
import {languageAlternates} from '@/lib/metadata';
import {ReadingChallengeContents} from '@/components/reading/ReadingCatalogs';
import {RefreshButton} from '@/components/layout/RefreshButton';
export const dynamic='force-dynamic';
export async function generateMetadata(props:{params: Promise<{id:string}>}) {
  const params = await props.params;
  const t=await getTranslations('readingChallenges');if(!z.string().uuid().safeParse(params.id).success)return {title:t('title'),robots:{index:false,follow:false}};const {data}=await createServiceClient().from('challenges').select('title').eq('id',params.id).maybeSingle();return {title:data?.title??t('title'),alternates:languageAlternates('/challenges/'+params.id)};
}
export default async function Page(props:{params: Promise<{id:string}>}) {
  const params = await props.params;
  const user=await getCurrentUser();if(!user)redirect('/login');if(!z.string().uuid().safeParse(params.id).success)notFound();const t=await getTranslations('readingChallenges');try{return <ReadingChallengeContents key={user.id+':'+params.id} actorId={user.id} initial={await getReadingChallenge(user.id,params.id)}/>;}catch(error){if(error instanceof ReadingCatalogError&&error.status===404)notFound();return <div className="p-8"><h1 className="text-2xl font-bold">{t('title')}</h1><p role="alert">{t('loadFailed')} <RefreshButton/></p></div>;}
}

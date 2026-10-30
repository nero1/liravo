import {getTranslations} from 'next-intl/server';
import {redirect} from 'next/navigation';
import {getCurrentUser} from '@/lib/auth/getCurrentUser';
import {languageAlternates} from '@/lib/metadata';
import {ReadingQuotes} from '@/components/reading/ReadingCatalogs';
export const dynamic='force-dynamic';
export async function generateMetadata(){const t=await getTranslations('readingQuotes');return {title:t('title'),alternates:languageAlternates('/quotes')};}
export default async function Page(){const user=await getCurrentUser();if(!user)redirect('/login');return <ReadingQuotes key={user.id} actorId={user.id}/>;}

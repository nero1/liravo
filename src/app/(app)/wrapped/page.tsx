import {getTranslations} from 'next-intl/server';
import {getCurrentUser} from '@/lib/auth/getCurrentUser';
import {languageAlternates} from '@/lib/metadata';
import {ReadingWrapped} from '@/components/books/ReadingWrapped';
import {redirect} from 'next/navigation';
export const dynamic='force-dynamic';
export async function generateMetadata(){const t=await getTranslations('wrapped');return {title:t('title'),alternates:languageAlternates('/wrapped')};}
export default async function WrappedPage(){const user=await getCurrentUser();if(!user)redirect('/login');return <ReadingWrapped key={user.id} actorId={user.id}/>;}

import {redirect} from 'next/navigation';
import {getTranslations} from 'next-intl/server';
import {getCurrentUser} from '@/lib/auth/getCurrentUser';
import {languageAlternates} from '@/lib/metadata';
import {BookPassingWorkflow} from '@/components/books/BookPassingWorkflow';
export const dynamic='force-dynamic';
export async function generateMetadata(){const t=await getTranslations('passTheBook');return{title:t('title'),description:t('subtitle'),alternates:languageAlternates('/pass-the-book')};}
export default async function Page(){const user=await getCurrentUser();if(!user)redirect('/login');return <BookPassingWorkflow key={user.id} actorId={user.id}/>;}

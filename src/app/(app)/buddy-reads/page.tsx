import {getTranslations} from 'next-intl/server';
import {getCurrentUser} from '@/lib/auth/getCurrentUser';
import {languageAlternates} from '@/lib/metadata';
import {BuddyCatalog} from '@/components/books/BuddyCatalog';
import {redirect} from 'next/navigation';
export const dynamic='force-dynamic';
export async function generateMetadata(){const t=await getTranslations('buddyReads');return {title:t('title'),description:t('description'),alternates:languageAlternates('/buddy-reads')};}
export default async function BuddyReadsPage(){const user=await getCurrentUser();if(!user)redirect('/login');return <BuddyCatalog key={user.id} actorId={user.id}/>;}

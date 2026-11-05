import {getTranslations} from 'next-intl/server';
import {getCurrentUser} from '@/lib/auth/getCurrentUser';
import {languageAlternates} from '@/lib/metadata';
import {NewBuddyRead} from '@/components/books/NewBuddyRead';
import {redirect} from 'next/navigation';
export const dynamic='force-dynamic';
export async function generateMetadata(){const t=await getTranslations('buddyReads');return {title:t('create'),description:t('description'),alternates:languageAlternates('/buddy-reads/new')};}
export default async function NewBuddyReadPage(){const user=await getCurrentUser();if(!user)redirect('/login');return <NewBuddyRead key={user.id} actorId={user.id}/>;}

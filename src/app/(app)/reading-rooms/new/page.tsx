import {getTranslations} from 'next-intl/server';
import {getCurrentUser} from '@/lib/auth/getCurrentUser';
import {languageAlternates} from '@/lib/metadata';
import {NewReadingRoom} from '@/components/reading-rooms/NewReadingRoom';
import {redirect} from 'next/navigation';
export const dynamic='force-dynamic';
export async function generateMetadata(){const t=await getTranslations('readingRooms');return {title:t('create'),description:t('description'),alternates:languageAlternates('/reading-rooms/new' )};}
export default async function Page(){const user=await getCurrentUser();if(!user)redirect('/login');return <NewReadingRoom key={user.id} actorId={user.id}/>;}

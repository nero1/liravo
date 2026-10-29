import {getTranslations} from 'next-intl/server';
import {getCurrentUser} from '@/lib/auth/getCurrentUser';
import {languageAlternates} from '@/lib/metadata';
import {ReadingRoomCatalog} from '@/components/reading-rooms/ReadingRoomCatalog';
import {redirect} from 'next/navigation';
export const dynamic='force-dynamic';
export async function generateMetadata(){const t=await getTranslations('readingRooms');return {title:t('title'),description:t('description'),alternates:languageAlternates('/reading-rooms' )};}
export default async function Page(){const user=await getCurrentUser();if(!user)redirect('/login');return <ReadingRoomCatalog key={user.id} actorId={user.id}/>;}

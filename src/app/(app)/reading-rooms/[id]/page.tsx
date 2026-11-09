import {getTranslations} from 'next-intl/server';
import {getCurrentUser} from '@/lib/auth/getCurrentUser';
import {languageAlternates} from '@/lib/metadata';
import {ReadingRoomDetail} from '@/components/reading-rooms/ReadingRoomDetail';
import {redirect,notFound} from 'next/navigation';
import {z} from 'zod';
export const dynamic='force-dynamic';
export async function generateMetadata(props:{params: Promise<{id:string}>}) {
  const params = await props.params;
  const t=await getTranslations('readingRooms');return {title:t('title'),description:t('description'),alternates:languageAlternates('/reading-rooms/'+params.id )};
}
export default async function Page(props:{params: Promise<{id:string}>}) {
  const params = await props.params;
  if(!z.string().uuid().safeParse(params.id).success)notFound();const user=await getCurrentUser();if(!user)redirect('/login');return <ReadingRoomDetail key={user.id+':'+params.id} actorId={user.id} roomId={params.id}/>;
}

import {getTranslations} from 'next-intl/server';
import {getCurrentUser} from '@/lib/auth/getCurrentUser';
import {languageAlternates} from '@/lib/metadata';
import {BuddyRoom} from '@/components/books/BuddyRoom';
import {redirect,notFound} from 'next/navigation';
import {z} from 'zod';
export const dynamic='force-dynamic';
export async function generateMetadata(props:{params: Promise<{id:string}>}) {
  const params = await props.params;
  const t=await getTranslations('buddyReadRoom');return {title:t('title'),alternates:languageAlternates('/buddy-reads/'+params.id)};
}
export default async function BuddyReadRoomPage(props:{params: Promise<{id:string}>}) {
  const params = await props.params;
  if(!z.string().uuid().safeParse(params.id).success)notFound();const user=await getCurrentUser();if(!user)redirect('/login');return <BuddyRoom key={user.id+':'+params.id} id={params.id} actorId={user.id}/>;
}

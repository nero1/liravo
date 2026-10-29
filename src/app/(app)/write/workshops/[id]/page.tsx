import {getTranslations} from 'next-intl/server';
import {getCurrentUser} from '@/lib/auth/getCurrentUser';
import {redirect,notFound} from 'next/navigation';
import {z} from 'zod';
import {WorkshopRoom} from './WorkshopRoom';
export const dynamic='force-dynamic';
export async function generateMetadata(){return {title:(await getTranslations('nativeWriting'))('workshops'),robots:{index:false}};}
export default async function WorkshopRoomPage({params}:{params:{id:string}}){
  if(!z.uuid().safeParse(params.id).success)notFound();
  const user=await getCurrentUser();if(!user)redirect('/login');
  return <WorkshopRoom key={user.id+params.id} roomId={params.id} actorId={user.id}/>;
}

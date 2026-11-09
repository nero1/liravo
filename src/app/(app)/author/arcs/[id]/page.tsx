import {getTranslations} from 'next-intl/server';
import {getCurrentUser} from '@/lib/auth/getCurrentUser';
import {languageAlternates} from '@/lib/metadata';
import {ArcApplications} from '@/components/author/ArcApplications';
import {notFound,redirect} from 'next/navigation';
import {z} from 'zod';
export const dynamic='force-dynamic';
export async function generateMetadata(props:{params: Promise<{id:string}>}) {
  const params = await props.params;
  const t=await getTranslations('arcs');return {title:t('applications'),alternates:languageAlternates('/author/arcs/'+encodeURIComponent(params.id))};
}
export default async function ArcPage(props:{params: Promise<{id:string}>}) {
  const params = await props.params;
  const user=await getCurrentUser();if(!user)redirect('/login');if(!z.string().uuid().safeParse(params.id).success)notFound();return <ArcApplications key={user.id+':'+params.id} actorId={user.id} arcId={params.id}/>;
}

import {getLocale,getTranslations} from 'next-intl/server';
import {getCurrentUser} from '@/lib/auth/getCurrentUser';
import {redirect} from 'next/navigation';
import {MoodAi} from '@/components/discovery/MoodAi';
export const dynamic='force-dynamic';
export async function generateMetadata(){const t=await getTranslations('discover');return{title:t('aiTitle'),robots:{index:false,follow:false}};}
export default async function MoodAiPage(){const user=await getCurrentUser();if(!user)redirect('/login');const locale=await getLocale();return <MoodAi key={user.id+locale} actorId={user.id}/>;}

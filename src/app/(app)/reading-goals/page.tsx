import {redirect} from 'next/navigation';
import {getTranslations} from 'next-intl/server';
import {getCurrentUser} from '@/lib/auth/getCurrentUser';
import {ReadingGoals} from '@/components/shelf/ReadingGoals';
export const dynamic='force-dynamic';
export async function generateMetadata(){const t=await getTranslations('readingGoals');return{title:t('title',{year:new Date().getUTCFullYear()}),robots:{index:false,follow:false}};}
export default async function ReadingGoalsPage(){const user=await getCurrentUser();if(!user)redirect('/login');return <ReadingGoals key={user.id} actorId={user.id}/>;}

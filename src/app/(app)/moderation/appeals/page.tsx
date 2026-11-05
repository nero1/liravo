import {redirect} from 'next/navigation';
import {getTranslations} from 'next-intl/server';
import {getCurrentUser} from '@/lib/auth/getCurrentUser';
import {isModerator} from '@/lib/moderation';
import {languageAlternates} from '@/lib/metadata';
import {AppealQueue} from '@/components/moderation/AppealWorkflow';
export const dynamic='force-dynamic';
export async function generateMetadata(){const t=await getTranslations('appealWorkflow');return {title:t('review'),alternates:languageAlternates('/moderation/appeals')};}
export default async function Page(){const user=await getCurrentUser();if(!user)redirect('/login');if(!await isModerator(user.id))redirect('/settings');return <AppealQueue key={user.id} actorId={user.id}/>;}

import {redirect} from 'next/navigation';
import {getTranslations} from 'next-intl/server';
import {getCurrentUser} from '@/lib/auth/getCurrentUser';
import {languageAlternates} from '@/lib/metadata';
import {AppealContents} from '@/components/moderation/AppealWorkflow';
export const dynamic='force-dynamic';
export async function generateMetadata(){const t=await getTranslations('appealWorkflow');return {title:t('title'),description:t('description'),alternates:languageAlternates('/settings/appeal')};}
export default async function Page(){const user=await getCurrentUser();if(!user)redirect('/login');return <AppealContents key={user.id} actorId={user.id}/>;}

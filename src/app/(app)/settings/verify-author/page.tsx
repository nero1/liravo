import {getTranslations} from 'next-intl/server';
import {getCurrentUser} from '@/lib/auth/getCurrentUser';
import {languageAlternates} from '@/lib/metadata';
import {redirect} from 'next/navigation';
import VerifyAuthorClient from './VerifyAuthorClient';
export const dynamic='force-dynamic';
export async function generateMetadata(){const t=await getTranslations('authorVerification');return {title:t('title'),description:t('description'),alternates:languageAlternates('/settings/verify-author')};}
export default async function VerifyAuthorPage(){const user=await getCurrentUser();if(!user)redirect('/login');return <VerifyAuthorClient key={user.id} actorId={user.id}/>;}

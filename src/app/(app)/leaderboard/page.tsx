import {getTranslations} from 'next-intl/server';
import {redirect} from 'next/navigation';
import {getCurrentUser} from '@/lib/auth/getCurrentUser';
import {languageAlternates} from '@/lib/metadata';
import {LeaderboardClient} from '@/components/leaderboard/LeaderboardClient';
export const dynamic='force-dynamic';
export async function generateMetadata(){const t=await getTranslations('leaderboard');return {title:t('title'),alternates:languageAlternates('/leaderboard')};}
export default async function Page(){const user=await getCurrentUser();if(!user)redirect('/login');return <LeaderboardClient key={user.id} actorId={user.id}/>;}

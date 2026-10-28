import { PUBLIC_USER_COLUMNS } from '@/lib/user-profile';
import { createClient } from '@/lib/supabase/server';
import { redirect } from 'next/navigation';
import { ProfileView } from '@/components/profile/ProfileView';
import {getTranslations} from 'next-intl/server';
import {getEarnedBadges} from '@/services/badges';

export const dynamic = 'force-dynamic';

export async function generateMetadata(){return {title:(await getTranslations('profile'))('myTitle'),robots:{index:false}};}

export default async function ProfilePage() {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  const { data: profile } = await supabase
    .from('users')
    .select(PUBLIC_USER_COLUMNS)
    .eq('id', user.id)
    .single();

  if (!profile) redirect('/login');

  return <ProfileView profile={{...profile,badges:await getEarnedBadges(user.id)}} isOwner />;
}

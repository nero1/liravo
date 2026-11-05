import { PUBLIC_USER_COLUMNS } from '@/lib/user-profile';
import { createClient } from '@/lib/supabase/server';
import { redirect } from 'next/navigation';
import { ProfileEditForm } from '@/components/profile/ProfileEditForm';
import {getTranslations} from 'next-intl/server';

export const dynamic = 'force-dynamic';

export async function generateMetadata(){const t=await getTranslations('profile');return{title:t('editProfile'),robots:{index:false,follow:false}};}

export default async function ProfileEditPage() {
  const t=await getTranslations('profile');
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  const { data: profile } = await supabase.from('users').select(PUBLIC_USER_COLUMNS).eq('id', user.id).single();
  if (!profile) redirect('/login');

  return (
    <div className="max-w-lg mx-auto px-4 py-6">
      <h1 className="font-display text-2xl font-bold mb-6">{t('editProfile')}</h1>
      <ProfileEditForm key={user.id} profile={profile} />
    </div>
  );
}

import { createClient } from '@/lib/supabase/server';
import { redirect } from 'next/navigation';
import { ProfileEditForm } from '@/components/profile/ProfileEditForm';
import type { Metadata } from 'next';

export const metadata: Metadata = { title: 'Edit Profile' };

export default async function ProfileEditPage() {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  const { data: profile } = await supabase.from('users').select('*').eq('id', user.id).single();
  if (!profile) redirect('/login');

  return (
    <div className="max-w-lg mx-auto px-4 py-6">
      <h1 className="font-display text-2xl font-bold mb-6">Edit Profile</h1>
      <ProfileEditForm profile={profile} />
    </div>
  );
}

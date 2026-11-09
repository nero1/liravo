import { createClient } from '@/lib/supabase/server';
import { redirect } from 'next/navigation';
import { OnboardingFlow } from '@/components/auth/OnboardingFlow';
import type { Metadata } from 'next';
import {getTranslations} from 'next-intl/server';

export const dynamic = 'force-dynamic';

export async function generateMetadata():Promise<Metadata>{return {title:(await getTranslations('onboarding'))('title'),robots:{index:false}};}

export default async function OnboardingPage() {
  const supabase = (await createClient());
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) redirect('/login');

  const { data: profile } = await supabase
    .from('users')
    .select('onboarding_complete, username, display_name')
    .eq('id', user.id)
    .single();

  if (profile?.onboarding_complete) redirect('/');

  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-4">
      <OnboardingFlow key={user.id} actorId={user.id}
        initialUsername={profile?.username ?? ''}
        initialDisplayName={profile?.display_name ?? ''}
      />
    </div>
  );
}

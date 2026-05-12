import { createClient } from '@/lib/supabase/server';
import { redirect } from 'next/navigation';

export default async function HomePage() {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    redirect('/login');
  }

  const { data: profile } = await supabase
    .from('users')
    .select('onboarding_complete, display_name')
    .eq('id', user.id)
    .single();

  if (!profile?.onboarding_complete) {
    redirect('/onboarding');
  }

  return (
    <div className="max-w-2xl mx-auto px-4 py-6">
      <h1 className="text-2xl font-display font-bold mb-6">
        Welcome back, {profile.display_name}
      </h1>
      <p className="text-muted-foreground">
        Your feed is loading. More features coming in Phase 2.
      </p>
    </div>
  );
}

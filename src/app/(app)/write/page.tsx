import { createClient } from '@/lib/supabase/server';
import { redirect } from 'next/navigation';
import type { Metadata } from 'next';

export const metadata: Metadata = { title: 'Write' };

export default async function WritePage() {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  return (
    <div className="max-w-2xl mx-auto px-4 py-6">
      <h1 className="font-display text-2xl font-bold mb-2">Write</h1>
      <p className="text-muted-foreground mb-8">
        The Newbie Writer track is coming in Phase 6. Stay tuned for writing challenges, daily prompts, and workshops.
      </p>
      <div className="bg-muted rounded-xl p-6 text-center">
        <span className="text-4xl mb-3 block">🌱</span>
        <p className="font-medium">Writing features coming soon</p>
        <p className="text-sm text-muted-foreground mt-1">Daily prompts, challenges, and workshop rooms</p>
      </div>
    </div>
  );
}

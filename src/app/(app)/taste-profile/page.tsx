import { createClient } from '@/lib/supabase/server';
import { redirect } from 'next/navigation';
import Link from 'next/link';
import type { Metadata } from 'next';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = { title: 'AI Taste Profile — Liravo' };

export default async function TasteProfilePage() {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  const { data: profile } = await supabase
    .from('users')
    .select('is_premium')
    .eq('id', user.id)
    .single();

  const isPremium = (profile as { is_premium?: boolean } | null)?.is_premium ?? false;

  if (!isPremium) {
    return (
      <div className="max-w-lg mx-auto px-4 py-12 text-center">
        <div className="text-5xl mb-4">✦</div>
        <h1 className="font-display text-2xl font-bold mb-3">AI Taste Profile</h1>
        <p className="text-muted-foreground mb-6">
          Get a personalised AI-generated reader taste profile with a Premium subscription.
        </p>
        <Link
          href="/premium"
          className="inline-block px-6 py-3 bg-accent text-accent-foreground rounded-lg font-semibold hover:bg-accent/90 transition-colors"
        >
          Go Premium — $4.99/month
        </Link>
      </div>
    );
  }

  // Load taste profile
  const { data: tasteProfile } = await supabase
    .from('ai_taste_profiles')
    .select('profile_text, generated_at')
    .eq('user_id', user.id)
    .order('generated_at', { ascending: false })
    .limit(1)
    .single();

  return (
    <div className="max-w-2xl mx-auto px-4 py-6">
      <div className="flex items-center justify-between mb-6">
        <h1 className="font-display text-2xl font-bold">Your Reading Taste Profile</h1>
        <RegenerateButton />
      </div>

      {tasteProfile ? (
        <div className="space-y-4">
          <div className="rounded-xl border border-border bg-card p-6">
            <p className="text-base leading-relaxed">{tasteProfile.profile_text}</p>
          </div>
          <p className="text-xs text-muted-foreground">
            Generated on{' '}
            {new Date(tasteProfile.generated_at).toLocaleDateString('en-US', {
              year: 'numeric',
              month: 'long',
              day: 'numeric',
            })}
          </p>
        </div>
      ) : (
        <div className="rounded-xl border border-border bg-card p-8 text-center">
          <p className="text-muted-foreground mb-4">
            No taste profile yet. Generate one based on your reading history.
          </p>
          <GenerateButton />
        </div>
      )}
    </div>
  );
}

function RegenerateButton() {
  return (
    <form action="/api/ai/taste-profile" method="POST">
      <button
        type="submit"
        className="px-4 py-2 text-sm border border-border rounded-lg hover:bg-muted transition-colors font-medium"
      >
        Regenerate
      </button>
    </form>
  );
}

function GenerateButton() {
  return (
    <form action="/api/ai/taste-profile" method="POST">
      <button
        type="submit"
        className="px-6 py-3 bg-accent text-accent-foreground rounded-lg font-semibold hover:bg-accent/90 transition-colors"
      >
        Generate My Taste Profile
      </button>
    </form>
  );
}

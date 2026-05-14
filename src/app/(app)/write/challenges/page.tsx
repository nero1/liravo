import { createClient } from '@/lib/supabase/server';
import { redirect } from 'next/navigation';
import Link from 'next/link';
import type { Metadata } from 'next';

export const metadata: Metadata = { title: 'Writing Challenges — Liravo' };

interface Challenge {
  id: string;
  name: string;
  description: string | null;
  challenge_type: string;
  goal_type: string;
  goal_value: number;
  start_date: string;
  end_date: string;
  participant_count: number;
}

function daysRemaining(endDate: string): number {
  const end = new Date(endDate);
  const now = new Date();
  const diff = Math.ceil((end.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
  return Math.max(0, diff);
}

export default async function WritingChallengesPage() {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  const today = new Date().toISOString().split('T')[0];

  const { data: challenges } = await supabase
    .from('writing_challenges')
    .select('*')
    .lte('start_date', today)
    .gte('end_date', today)
    .order('end_date', { ascending: true });

  const { data: joined } = await supabase
    .from('writing_challenge_participants')
    .select('challenge_id')
    .eq('user_id', user.id);

  const joinedIds = new Set((joined ?? []).map((j: { challenge_id: string }) => j.challenge_id));

  return (
    <div className="max-w-2xl mx-auto px-4 py-6">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="font-display text-2xl font-bold">Writing Challenges</h1>
          <p className="text-muted-foreground text-sm mt-0.5">
            Weekly and monthly challenges with leaderboards and badges.
          </p>
        </div>
        <Link href="/write" className="text-sm text-muted-foreground hover:text-foreground">
          ← Write Hub
        </Link>
      </div>

      {(challenges ?? []).length === 0 ? (
        <div className="rounded-xl border bg-muted p-8 text-center">
          <p className="text-muted-foreground">No active challenges right now. Check back soon!</p>
        </div>
      ) : (
        <div className="space-y-4">
          {(challenges ?? []).map((c: Challenge) => {
            const days = daysRemaining(c.end_date);
            const isJoined = joinedIds.has(c.id);
            return (
              <div key={c.id} className="rounded-xl border bg-card p-5">
                <div className="flex items-start justify-between gap-4">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <span className="text-xs font-medium bg-amber-100 dark:bg-amber-900 text-amber-800 dark:text-amber-200 px-2 py-0.5 rounded-full">
                        {c.challenge_type === 'weekly' ? 'Weekly' : 'Monthly'}
                      </span>
                      {days <= 3 && days > 0 && (
                        <span className="text-xs text-red-500 font-medium">Ending soon!</span>
                      )}
                    </div>
                    <h2 className="font-semibold text-lg">{c.name}</h2>
                    {c.description && (
                      <p className="text-sm text-muted-foreground mt-1 line-clamp-2">
                        {c.description}
                      </p>
                    )}
                    <div className="flex items-center gap-4 mt-3 text-xs text-muted-foreground">
                      <span>
                        Goal: {c.goal_value.toLocaleString()}{' '}
                        {c.goal_type === 'word_count' ? 'words' : 'submissions'}
                      </span>
                      <span>{days} days remaining</span>
                      <span>{c.participant_count} participants</span>
                    </div>
                  </div>
                  <div className="flex flex-col gap-2 shrink-0">
                    <Link
                      href={`/write/challenges/${c.id}`}
                      className="rounded-lg border px-3 py-1.5 text-sm hover:bg-muted transition-colors text-center"
                    >
                      View
                    </Link>
                    {!isJoined && (
                      <JoinButton challengeId={c.id} />
                    )}
                    {isJoined && (
                      <span className="text-xs text-green-600 dark:text-green-400 font-medium text-center">
                        ✓ Joined
                      </span>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

function JoinButton({ challengeId }: { challengeId: string }) {
  return (
    <form
      action={async () => {
        'use server';
        const supabase = createClient();
        const {
          data: { user },
        } = await supabase.auth.getUser();
        if (!user) return;

        const { data: existing } = await supabase
          .from('writing_challenge_participants')
          .select('id')
          .eq('user_id', user.id)
          .eq('challenge_id', challengeId)
          .maybeSingle();

        if (existing) return;

        await supabase
          .from('writing_challenge_participants')
          .insert({ user_id: user.id, challenge_id: challengeId });

        const { data: challenge } = await supabase
          .from('writing_challenges')
          .select('participant_count')
          .eq('id', challengeId)
          .single();

        if (challenge) {
          await supabase
            .from('writing_challenges')
            .update({ participant_count: (challenge.participant_count ?? 0) + 1 })
            .eq('id', challengeId);
        }
      }}
    >
      <button
        type="submit"
        className="rounded-lg bg-amber-600 hover:bg-amber-700 text-white text-sm font-medium px-3 py-1.5 transition-colors w-full"
      >
        Join
      </button>
    </form>
  );
}

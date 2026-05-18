import { createClient } from '@/lib/supabase/server';
import Link from 'next/link';
import type { Metadata } from 'next';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = { title: 'Community Challenges' };

interface Challenge {
  id: string;
  name: string;
  description: string | null;
  type: 'weekly' | 'monthly';
  goal_books: number | null;
  goal_pages: number | null;
  starts_at: string;
  ends_at: string;
}

function formatDate(dateStr: string) {
  return new Date(dateStr).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

function daysLeft(endStr: string) {
  const diff = new Date(endStr).getTime() - Date.now();
  return Math.max(0, Math.ceil(diff / (1000 * 60 * 60 * 24)));
}

export default async function ChallengesPage() {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();

  const now = new Date().toISOString();

  const { data: activeChallenges } = await supabase 
    .from('challenges')
    .select('id, name, description, type, goal_books, goal_pages, starts_at, ends_at')
    .lte('starts_at', now)
    .gte('ends_at', now)
    .order('ends_at', { ascending: true });

  let joinedChallengeIds: Set<string> = new Set();
  if (user) {
    const { data: participations } = await supabase 
      .from('challenge_participants')
      .select('challenge_id')
      .eq('user_id', user.id);
    joinedChallengeIds = new Set(
      ((participations ?? []) as { challenge_id: string }[]).map((p) => p.challenge_id)
    );
  }

  const challenges: Challenge[] = activeChallenges ?? [];
  const weeklyChallenges = challenges.filter((c) => c.type === 'weekly');
  const monthlyChallenges = challenges.filter((c) => c.type === 'monthly');

  return (
    <div className="max-w-2xl mx-auto px-4 py-6 space-y-8">
      <h1 className="font-display text-2xl font-bold">Community Challenges</h1>

      {challenges.length === 0 && (
        <div className="text-center py-16 text-neutral-500">
          No active challenges right now. Check back soon!
        </div>
      )}

      {weeklyChallenges.length > 0 && (
        <section>
          <h2 className="font-semibold text-lg mb-3">Weekly Challenges</h2>
          <div className="space-y-3">
            {weeklyChallenges.map((c) => (
              <ChallengeCard key={c.id} challenge={c} joined={joinedChallengeIds.has(c.id)} />
            ))}
          </div>
        </section>
      )}

      {monthlyChallenges.length > 0 && (
        <section>
          <h2 className="font-semibold text-lg mb-3">Monthly Challenges</h2>
          <div className="space-y-3">
            {monthlyChallenges.map((c) => (
              <ChallengeCard key={c.id} challenge={c} joined={joinedChallengeIds.has(c.id)} />
            ))}
          </div>
        </section>
      )}
    </div>
  );
}

function ChallengeCard({ challenge, joined }: { challenge: Challenge; joined: boolean }) {
  const left = daysLeft(challenge.ends_at);

  return (
    <Link
      href={`/challenges/${challenge.id}`}
      className="block p-4 border border-neutral-200 dark:border-neutral-700 rounded-lg hover:bg-neutral-50 dark:hover:bg-neutral-800 transition-colors"
    >
      <div className="flex items-start justify-between gap-3">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1">
            <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${challenge.type === 'weekly' ? 'bg-blue-100 text-blue-700 dark:bg-blue-900 dark:text-blue-300' : 'bg-violet-100 text-violet-700 dark:bg-violet-900 dark:text-violet-300'}`}>
              {challenge.type === 'weekly' ? 'Weekly' : 'Monthly'}
            </span>
            {joined && (
              <span className="text-xs px-2 py-0.5 rounded-full bg-green-100 text-green-700 dark:bg-green-900 dark:text-green-300 font-medium">
                Joined
              </span>
            )}
          </div>
          <p className="font-semibold">{challenge.name}</p>
          {challenge.description && (
            <p className="text-sm text-neutral-500 mt-1 line-clamp-2">{challenge.description}</p>
          )}
          <div className="flex gap-4 mt-2 text-xs text-neutral-500">
            {challenge.goal_books && <span>Goal: {challenge.goal_books} books</span>}
            {challenge.goal_pages && <span>Goal: {challenge.goal_pages} pages</span>}
          </div>
        </div>
        <div className="text-right flex-shrink-0">
          <p className="text-sm font-medium text-accent">{left}d left</p>
          <p className="text-xs text-neutral-500">Ends {formatDate(challenge.ends_at)}</p>
        </div>
      </div>
    </Link>
  );
}

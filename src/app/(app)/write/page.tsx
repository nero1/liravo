import { createClient } from '@/lib/supabase/server';
import { redirect } from 'next/navigation';
import Link from 'next/link';
import type { Metadata } from 'next';
import { cn } from '@/lib/utils';

export const metadata: Metadata = { title: 'Write — Newbie Writer Track' };

const FEATURE_CARDS = [
  {
    href: '/write/prompts',
    icon: '✏️',
    title: 'Daily Prompt',
    description: 'A new writing prompt every day. Submit your response and earn XP.',
  },
  {
    href: '/write/challenges',
    icon: '🏆',
    title: 'Writing Challenges',
    description: 'Weekly and monthly challenges with leaderboards and badges.',
  },
  {
    href: '/write/workshops',
    icon: '🛠️',
    title: 'Workshop Rooms',
    description: 'Small-group critique sessions. Get feedback from fellow writers.',
  },
  {
    href: '/write/progress',
    icon: '📈',
    title: 'Writing Progress',
    description: 'Track your words written, streak, and milestones.',
  },
  {
    href: '/write/resources',
    icon: '📚',
    title: 'Resource Library',
    description: 'Essential craft books curated for writers at every level.',
  },
  {
    href: '/write/ask',
    icon: '💬',
    title: 'Ask a Writer',
    description: 'Pose questions to verified authors and experienced writers.',
  },
];

export default async function WritePage() {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  const { data: profile } = await supabase
    .from('users')
    .select('display_name, user_types, xp')
    .eq('id', user.id)
    .single();

  const isNewbieWriter = profile?.user_types?.includes('newbie_writer') ?? false;

  // Fetch writing stats
  const { data: promptStats } = await supabase
    .from('prompt_submissions')
    .select('id, word_count', { count: 'exact' })
    .eq('user_id', user.id);

  const { data: challengeStats } = await supabase
    .from('writing_challenge_entries')
    .select('id, word_count', { count: 'exact' })
    .eq('user_id', user.id);

  const promptCount = promptStats?.length ?? 0;
  const promptWords = (promptStats ?? []).reduce(
    (sum: number, r: { word_count?: number }) => sum + (r.word_count ?? 0),
    0
  );
  const challengeWords = (challengeStats ?? []).reduce(
    (sum: number, r: { word_count?: number }) => sum + (r.word_count ?? 0),
    0
  );
  const totalWords = promptWords + challengeWords;

  return (
    <div className="max-w-3xl mx-auto px-4 py-6">
      {/* Hero */}
      <div className="rounded-2xl bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800 p-6 mb-8">
        <div className="flex items-center gap-3 mb-2">
          <span className="text-3xl">🌱</span>
          <h1 className="font-display text-2xl font-bold text-amber-900 dark:text-amber-100">
            Welcome to the Write Track
          </h1>
        </div>
        <p className="text-amber-800 dark:text-amber-200 text-sm">
          {isNewbieWriter
            ? `Keep writing, ${profile?.display_name ?? 'writer'}! Every word counts.`
            : 'Join the Newbie Writer track to unlock writing challenges, daily prompts, and workshop rooms.'}
        </p>

        {!isNewbieWriter && (
          <Link
            href="/settings/account"
            className="mt-4 inline-flex items-center gap-2 rounded-lg bg-amber-600 hover:bg-amber-700 text-white text-sm font-medium px-4 py-2 transition-colors"
          >
            Join the Writer Track
          </Link>
        )}
      </div>

      {/* Stats row */}
      {isNewbieWriter && (
        <div className="grid grid-cols-3 gap-3 mb-8">
          {[
            { label: 'Prompts Completed', value: promptCount },
            { label: 'Words Written', value: totalWords.toLocaleString() },
            { label: 'XP Earned', value: (profile?.xp ?? 0).toLocaleString() },
          ].map((stat) => (
            <div
              key={stat.label}
              className="rounded-xl bg-muted px-4 py-3 text-center"
            >
              <p className="text-2xl font-bold text-amber-700 dark:text-amber-400">
                {stat.value}
              </p>
              <p className="text-xs text-muted-foreground mt-0.5">{stat.label}</p>
            </div>
          ))}
        </div>
      )}

      {/* Feature cards */}
      <h2 className="font-display text-lg font-semibold mb-4">Writer Features</h2>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        {FEATURE_CARDS.map((card) => (
          <Link
            key={card.href}
            href={card.href}
            className={cn(
              'rounded-xl border bg-card p-5 hover:shadow-md transition-shadow group',
              !isNewbieWriter && 'opacity-60 pointer-events-none'
            )}
          >
            <div className="flex items-start gap-3">
              <span className="text-2xl">{card.icon}</span>
              <div>
                <p className="font-semibold group-hover:text-amber-700 dark:group-hover:text-amber-400 transition-colors">
                  {card.title}
                </p>
                <p className="text-sm text-muted-foreground mt-0.5">{card.description}</p>
              </div>
            </div>
          </Link>
        ))}
      </div>

      {!isNewbieWriter && (
        <p className="text-center text-sm text-muted-foreground mt-6">
          Join the Writer Track to unlock all features above.
        </p>
      )}
    </div>
  );
}

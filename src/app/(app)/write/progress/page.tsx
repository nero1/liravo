import { createClient } from '@/lib/supabase/server';
import { redirect } from 'next/navigation';
import Link from 'next/link';
import type { Metadata } from 'next';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = { title: 'Writing Progress — Liravo' };

interface WeeklyEntry {
  week_label: string;
  words: number;
}

interface BadgeRow {
  badge_id: string;
  awarded_at: string;
}

export default async function WritingProgressPage() {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  const { data: profile } = await supabase
    .from('users')
    .select('display_name, reading_streak, xp')
    .eq('id', user.id)
    .single();

  // Aggregate writing stats
  const { data: promptSubs } = await supabase
    .from('prompt_submissions')
    .select('word_count, created_at')
    .eq('user_id', user.id);

  const { data: challengeEntries } = await supabase
    .from('writing_challenge_entries')
    .select('word_count, created_at')
    .eq('user_id', user.id);

  const { data: workshopSubs } = await supabase
    .from('workshop_submissions')
    .select('id, created_at')
    .eq('user_id', user.id);

  const promptWords = (promptSubs ?? []).reduce(
    (sum: number, r: { word_count?: number }) => sum + (r.word_count ?? 0),
    0
  );
  const challengeWords = (challengeEntries ?? []).reduce(
    (sum: number, r: { word_count?: number }) => sum + (r.word_count ?? 0),
    0
  );
  const totalWords = promptWords + challengeWords;
  const promptCount = (promptSubs ?? []).length;
  const challengeCount = (challengeEntries ?? []).length;
  const workshopCount = (workshopSubs ?? []).length;

  // Badges
  const { data: badges } = await supabase
    .from('user_badges')
    .select('badge_id, awarded_at')
    .eq('user_id', user.id)
    .in('badge_id', ['first_prompt', 'writing_streak_7', 'writing_streak_30', 'challenge_finisher', 'workshop_veteran', 'prolific_writer']);

  // Weekly word counts (last 7 weeks)
  const weeklyData: WeeklyEntry[] = [];
  const allEntries = [
    ...(promptSubs ?? []).map((r: { word_count?: number; created_at: string }) => ({
      words: r.word_count ?? 0,
      created_at: r.created_at,
    })),
    ...(challengeEntries ?? []).map((r: { word_count?: number; created_at: string }) => ({
      words: r.word_count ?? 0,
      created_at: r.created_at,
    })),
  ];

  for (let i = 6; i >= 0; i--) {
    const weekStart = new Date();
    weekStart.setDate(weekStart.getDate() - i * 7 - weekStart.getDay());
    weekStart.setHours(0, 0, 0, 0);
    const weekEnd = new Date(weekStart);
    weekEnd.setDate(weekEnd.getDate() + 6);

    const words = allEntries
      .filter((e) => {
        const d = new Date(e.created_at);
        return d >= weekStart && d <= weekEnd;
      })
      .reduce((sum, e) => sum + e.words, 0);

    weeklyData.push({
      week_label: weekStart.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
      words,
    });
  }

  const maxWeekWords = Math.max(...weeklyData.map((w) => w.words), 1);

  const WRITING_BADGE_LABELS: Record<string, { name: string; icon: string }> = {
    first_prompt: { name: 'First Prompt', icon: '✏️' },
    writing_streak_7: { name: '7-Day Streak', icon: '🔥' },
    writing_streak_30: { name: '30-Day Streak', icon: '🏆' },
    challenge_finisher: { name: 'Challenge Finisher', icon: '🏅' },
    workshop_veteran: { name: 'Workshop Veteran', icon: '🛠️' },
    prolific_writer: { name: 'Prolific Writer', icon: '📝' },
  };

  return (
    <div className="max-w-2xl mx-auto px-4 py-6">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="font-display text-2xl font-bold">Writing Progress</h1>
          <p className="text-muted-foreground text-sm mt-0.5">
            Your writing stats and milestones.
          </p>
        </div>
        <Link href="/write" className="text-sm text-muted-foreground hover:text-foreground">
          ← Write Hub
        </Link>
      </div>

      {/* Stats grid */}
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 mb-8">
        {[
          { label: 'Words Written', value: totalWords.toLocaleString() },
          { label: 'Prompts Completed', value: promptCount },
          { label: 'Challenges Completed', value: challengeCount },
          { label: 'Workshop Critiques', value: workshopCount },
          { label: 'Writing Streak', value: `${profile?.reading_streak ?? 0} days` },
          { label: 'Total XP', value: (profile?.xp ?? 0).toLocaleString() },
        ].map((stat) => (
          <div key={stat.label} className="rounded-xl bg-muted px-4 py-3 text-center">
            <p className="text-2xl font-bold text-amber-700 dark:text-amber-400">{stat.value}</p>
            <p className="text-xs text-muted-foreground mt-0.5">{stat.label}</p>
          </div>
        ))}
      </div>

      {/* Weekly word chart */}
      <div className="mb-8">
        <h2 className="font-semibold mb-3">Weekly Words (last 7 weeks)</h2>
        <div className="rounded-xl border bg-card p-5">
          <div className="flex items-end gap-2 h-32">
            {weeklyData.map((week) => {
              const heightPct = maxWeekWords > 0 ? (week.words / maxWeekWords) * 100 : 0;
              return (
                <div key={week.week_label} className="flex-1 flex flex-col items-center gap-1">
                  <span className="text-xs text-muted-foreground">{week.words > 0 ? week.words.toLocaleString() : ''}</span>
                  <div
                    className="w-full rounded-t bg-amber-400 dark:bg-amber-600 transition-all"
                    style={{ height: `${Math.max(4, heightPct)}%` }}
                  />
                  <span className="text-xs text-muted-foreground whitespace-nowrap">{week.week_label}</span>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* Writing badges */}
      <div>
        <h2 className="font-semibold mb-3">Writing Badges</h2>
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
          {Object.entries(WRITING_BADGE_LABELS).map(([badgeId, badge]) => {
            const earned = (badges ?? []).find((b: BadgeRow) => b.badge_id === badgeId);
            return (
              <div
                key={badgeId}
                className={`rounded-xl border p-4 text-center transition-opacity ${
                  earned ? 'opacity-100' : 'opacity-40'
                }`}
              >
                <p className="text-2xl mb-1">{badge.icon}</p>
                <p className="text-sm font-medium">{badge.name}</p>
                {earned && (
                  <p className="text-xs text-muted-foreground mt-0.5">
                    {new Date(earned.awarded_at).toLocaleDateString()}
                  </p>
                )}
                {!earned && (
                  <p className="text-xs text-muted-foreground mt-0.5">Not earned yet</p>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

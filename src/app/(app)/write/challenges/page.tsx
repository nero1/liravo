import { ChallengeJoinButton } from '@/components/writing/ChallengeJoinButton';
import { createClient } from '@/lib/supabase/server';
import { redirect } from 'next/navigation';
import Link from 'next/link';
import { getTranslations } from 'next-intl/server';
import type { Metadata } from 'next';

export const dynamic = 'force-dynamic';

export async function generateMetadata(): Promise<Metadata> { return { title: (await getTranslations('writing'))('challengeTitle') }; }

interface Challenge {
  id: string;
  title: string;
  description: string | null;
  type: string;
  goal_type: string;
  goal_value: number;
  start_date: string|null;
  end_date: string|null;
  participant_count: number;
}

function daysRemaining(endDate: string|null): number {
  const end = new Date(endDate??'');
  const now = new Date();
  const diff = Math.ceil((end.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
  return Math.max(0, diff);
}

export default async function WritingChallengesPage() {
  const t = await getTranslations('writing');
  const supabase = (await createClient());
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  const today = new Date().toISOString();

  const { data: challenges, error: challengesError } = await supabase
    .from('writing_challenges')
    .select('*')
    .eq('is_active',true)
    .lte('start_date', today)
    .gte('end_date', today)
    .order('end_date', { ascending: true });

  const { data: joined, error: joinedError } = await supabase
    .from('writing_challenge_participants')
    .select('challenge_id')
    .eq('user_id', user.id);

  if (challengesError || joinedError) throw new Error('Writing challenges unavailable');
  const joinedIds = new Set((joined ?? []).map((j: { challenge_id: string }) => j.challenge_id));

  return (
    <div className="max-w-2xl mx-auto px-4 py-6">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="font-display text-2xl font-bold">{t('challengeTitle')}</h1>
          <p className="text-muted-foreground text-sm mt-0.5">{t('challengeSubtitle')}</p>
        </div>
        <Link href="/write" className="text-sm text-muted-foreground hover:text-foreground">{t('writeHub')}</Link>
      </div>

      {(challenges ?? []).length === 0 ? (
        <div className="rounded-xl border bg-muted p-8 text-center">
          <p className="text-muted-foreground">{t('noChallenges')}</p>
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
                        {c.type === 'weekly' ? t('weekly') : t('monthly')}
                      </span>
                      {days <= 3 && days > 0 && (
                        <span className="text-xs text-red-500 font-medium">{t('endingSoon')}</span>
                      )}
                    </div>
                    <h2 className="font-semibold text-lg">{c.title}</h2>
                    {c.description && (
                      <p className="text-sm text-muted-foreground mt-1 line-clamp-2">
                        {c.description}
                      </p>
                    )}
                    <div className="flex items-center gap-4 mt-3 text-xs text-muted-foreground">
                      <span>
                        {t(c.goal_type === 'word_count' ? 'goalWords' : 'goalSubmissions',{count:c.goal_value})}
                      </span>
                      <span>{t('daysRemaining',{count:days})}</span>
                      <span>{t('participants',{count:c.participant_count})}</span>
                    </div>
                  </div>
                  <div className="flex flex-col gap-2 shrink-0">
                    <Link
                      href={`/write/challenges/${c.id}`}
                      className="rounded-lg border px-3 py-1.5 text-sm hover:bg-muted transition-colors text-center"
                    >{t('view')}</Link>
                    <ChallengeJoinButton challengeId={c.id} initialJoined={isJoined} />
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

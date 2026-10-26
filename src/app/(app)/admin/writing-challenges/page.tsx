import { getCurrentUser } from '@/lib/auth/getCurrentUser';
import { isAdmin } from '@/lib/moderation';
import { getTranslations, getFormatter } from 'next-intl/server';
import { createServiceClient } from '@/lib/supabase/server';
import { redirect } from 'next/navigation';
import type { Metadata } from 'next';

export const dynamic = 'force-dynamic';

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('admin');
  return { title: t('writingChallenges') };
}

interface WritingChallenge {
  id: string;
  title: string;
  type: string;
  start_date: string | null;
  end_date: string | null;
  is_active: boolean;
}

interface WritingPrompt {
  id: string;
  prompt_text: string;
  prompt_date: string | null;
  is_active: boolean;
}

export default async function WritingChallengesAdminPage() {
  const formatter = await getFormatter();
  const t = await getTranslations('admin');
  const user = await getCurrentUser();
  if (!user) redirect('/login');
  if (!await isAdmin(user.id)) redirect('/');
  const supabase = createServiceClient();

  const [{ data: challenges }, { data: prompts }] = await Promise.all([
    supabase
      .from('writing_challenges')
      .select('id, title, type, start_date, end_date, is_active')
      .order('created_at', { ascending: false })
      .limit(50),
    supabase
      .from('writing_prompts')
      .select('id, prompt_text, prompt_date, is_active')
      .order('prompt_date', { ascending: false })
      .limit(30),
  ]);

  const now = new Date();

  return (
    <div className="max-w-4xl mx-auto px-4 py-6 space-y-10">
      <div>
        <h1 className="font-display text-2xl font-bold mb-1">{t('writingChallenges')}</h1>
        <p className="text-sm text-muted-foreground mb-6">{t('writingChallengesDescription')}</p>

        {(challenges ?? []).length === 0 ? (
          <p className="text-muted-foreground text-sm">{t('noWritingChallengesYet')}</p>
        ) : (
          <div className="space-y-2">
            {(challenges as WritingChallenge[]).map((c) => {
              const isLive = c.is_active && c.start_date && c.end_date &&
                new Date(c.start_date) <= now && new Date(c.end_date) >= now;
              return (
                <div key={c.id} className="flex items-center justify-between p-3 border border-border rounded-xl">
                  <div>
                    <span className="font-medium text-sm">{c.title}</span>
                    <span className="ml-2 text-xs text-muted-foreground capitalize">{c.type}</span>
                  </div>
                  <div className="flex items-center gap-3">
                    <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${
                      isLive ? 'bg-green-500/10 text-green-700 dark:text-green-400'
                              : 'bg-muted text-muted-foreground'
                    }`}>
                      {isLive ? t('live') : c.is_active ? t('active') : t('inactive')}
                    </span>
                    <span className="text-xs text-muted-foreground">
                      {c.start_date ? formatter.dateTime(new Date(c.start_date), { dateStyle: 'medium' }) : '—'}
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      <div>
        <h2 className="font-display text-xl font-bold mb-1">{t('dailyPrompts')}</h2>
        <p className="text-sm text-muted-foreground mb-4">{t('dailyPromptsHint', { endpoint: 'POST /api/cron/generate-prompts', count: 30 })}</p>

        {(prompts ?? []).length === 0 ? (
          <p className="text-muted-foreground text-sm">{t('noPromptsGeneratedYetTriggerTheCronToPopulate')}</p>
        ) : (
          <div className="space-y-2">
            {(prompts as WritingPrompt[]).map((p) => (
              <div key={p.id} className="p-3 border border-border rounded-xl">
                <div className="flex items-start justify-between gap-4">
                  <p className="text-sm">{p.prompt_text}</p>
                  <div className="shrink-0 flex items-center gap-2">
                    {p.prompt_date && (
                      <span className="text-xs text-muted-foreground">
                        {formatter.dateTime(new Date(p.prompt_date), { dateStyle: 'medium' })}
                      </span>
                    )}
                    <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${
                      p.is_active ? 'bg-green-500/10 text-green-700 dark:text-green-400'
                                  : 'bg-muted text-muted-foreground'
                    }`}>
                      {p.is_active ? t('active') : t('off')}
                    </span>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

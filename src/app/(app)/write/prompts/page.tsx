'use client';

import { useRequestIntent } from '@/lib/client/useRequestIntent';
import { useState, useEffect, useRef } from 'react';
import Link from 'next/link';
import { useTranslations, useFormatter } from 'next-intl';
import Image from 'next/image';

interface WritingPrompt {
  id: string;
  prompt_text: string;
  theme: string | null;
  date: string;
}

interface SubmitState {
  content: string;
  loading: boolean;
  error: string | null;
  success: boolean;
}

interface LeaderEntry {
  rank: number;
  user_id: string;
  display_name: string;
  username: string;
  avatar_url: string | null;
  xp: number;
  submissions_count: number;
}

type LBPeriod = 'weekly' | 'monthly' | 'all_time';

export default function PromptsPage() {
  const t = useTranslations('writing');
  const formatter = useFormatter();
  const intent = useRequestIntent();
  const busy = useRef(false);
  const [todayPrompt, setTodayPrompt] = useState<WritingPrompt | null>(null);
  const [pastPrompts, setPastPrompts] = useState<WritingPrompt[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError,setLoadError] = useState(false);
  const [charCount, setCharCount] = useState(0);
  const [submit, setSubmit] = useState<SubmitState>({
    content: '',
    loading: false,
    error: null,
    success: false,
  });

  const [leaderboard, setLeaderboard] = useState<LeaderEntry[]>([]);
  const [lbPeriod, setLbPeriod] = useState<LBPeriod>('monthly');
  const [lbLoading, setLbLoading] = useState(false);

  useEffect(() => {
    fetch('/api/write/prompts')
      .then(r => { if (!r.ok) throw new Error('Writing request failed'); return r.json(); })
      .then((data) => {
        setTodayPrompt(data.today ?? null);
        setPastPrompts(data.past ?? []);
      })
      .catch(()=>setLoadError(true))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    setLbLoading(true);
    fetch(`/api/write/prompts/leaderboard?period=${lbPeriod}`)
      .then(r => { if (!r.ok) throw new Error('Writing request failed'); return r.json(); })
      .then((d) => setLeaderboard(d.leaderboard ?? []))
      .catch(()=>setLoadError(true))
      .finally(() => setLbLoading(false));
  }, [lbPeriod]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!todayPrompt || busy.current) return;
    busy.current = true;
    setSubmit((s) => ({ ...s, loading: true, error: null }));
    try {
      const res = await fetch(`/api/write/prompts/${todayPrompt.id}/submit`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...intent.headers({content:submit.content}) },
        body: JSON.stringify({ content: submit.content }),
      });
      const data = await res.json();
      if (!res.ok || !data.submission?.id) {
        setSubmit((s) => ({ ...s, loading: false, error: res.status===409 ? t('alreadySubmitted') : t('submitFailure') }));
      } else {
        intent.complete();
        setSubmit((s) => ({ ...s, loading: false, success: true }));
      }
    } catch { setSubmit(s=>({...s,error:t('submitFailure')})); }
    finally { busy.current = false; setSubmit(s=>({...s,loading:false})); }
  }

  if (loading) {
    return (
      <div className="max-w-2xl mx-auto px-4 py-8">
        <div className="animate-pulse space-y-4">
          <div className="h-8 bg-muted rounded w-1/2" />
          <div className="h-32 bg-muted rounded" />
        </div>
      </div>
    );
  }

  const PERIODS: { key: LBPeriod; label: string }[] = [
    { key: 'weekly', label: t('periodWeekly') },
    { key: 'monthly', label: t('periodMonthly') },
    { key: 'all_time', label: t('periodAll') },
  ];

  return (
    <div className="max-w-2xl mx-auto px-4 py-6">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="font-display text-2xl font-bold">{t('promptTitle')}</h1>
          <p className="text-muted-foreground text-sm mt-0.5">{t('promptSubtitle')}</p>
        </div>
        <Link href="/write" className="text-sm text-muted-foreground hover:text-foreground">{t('writeHub')}</Link>
      </div>

      {loadError && <p role="alert" className="text-destructive mb-4">{t('loadFailure')}</p>}

      {/* Today's prompt */}
      {todayPrompt ? (
        <div className="rounded-xl border border-amber-200 dark:border-amber-800 bg-amber-50 dark:bg-amber-950/30 p-6 mb-6">
          <div className="flex items-center gap-2 mb-3">
            <span className="text-xs font-medium bg-amber-200 dark:bg-amber-800 text-amber-900 dark:text-amber-100 px-2 py-0.5 rounded-full">{t('today')}</span>
            {todayPrompt.theme && (
              <span className="text-xs text-muted-foreground">{todayPrompt.theme}</span>
            )}
          </div>
          <p className="text-lg font-medium text-amber-900 dark:text-amber-100 mb-4">
            {todayPrompt.prompt_text}
          </p>
          <Link
            href={`/write/prompts/${todayPrompt.id}`}
            className="text-xs text-amber-700 dark:text-amber-400 hover:underline"
          >{t('viewResponses')}</Link>
        </div>
      ) : (
        <div className="rounded-xl border bg-muted p-6 mb-6 text-center text-muted-foreground">{t('promptMissing')}</div>
      )}

      {/* Submit form */}
      {todayPrompt && !submit.success && (
        <form onSubmit={handleSubmit} className="mb-8">
          <label className="block text-sm font-medium mb-2" htmlFor="response">{t('responseLabel')}</label>
          <textarea
            id="response"
            rows={8}
            minLength={50}
            maxLength={2000}
            required
            placeholder={t('responsePlaceholder')}
            className="w-full rounded-lg border bg-background px-3 py-2 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-amber-500"
            value={submit.content}
            onChange={(e) => {
              setSubmit((s) => ({ ...s, content: e.target.value }));
              setCharCount(e.target.value.length);
            }}
          />
          <div className="flex items-center justify-between mt-2">
            <span className="text-xs text-muted-foreground">{t('charCount',{count:charCount})}</span>
            {submit.error && <span className="text-xs text-red-500">{submit.error}</span>}
          </div>
          <button
            type="submit"
            disabled={submit.loading || charCount < 50}
            className="mt-3 rounded-lg bg-amber-600 hover:bg-amber-700 disabled:opacity-50 text-white text-sm font-medium px-5 py-2 transition-colors"
          >
            {submit.loading ? t('submitting') : t('submitResponse')}
          </button>
        </form>
      )}

      {submit.success && (
        <div className="rounded-xl bg-green-50 dark:bg-green-950/30 border border-green-200 dark:border-green-800 p-4 mb-8">
          <p role="status" className="text-green-800 dark:text-green-200 font-medium">{t('responseSubmitted')}</p>
        </div>
      )}

      {/* Leaderboard */}
      <section className="mb-8">
        <div className="flex items-center justify-between mb-3">
          <h2 className="font-semibold">{t('topWriters')}</h2>
          <div className="flex gap-1">
            {PERIODS.map(({ key, label }) => (
              <button
                key={key}
                onClick={() => setLbPeriod(key)}
                aria-pressed={lbPeriod === key}
                className={`px-2.5 py-1 rounded-full text-xs font-medium transition-colors ${lbPeriod === key ? 'bg-accent text-white' : 'bg-muted text-muted-foreground hover:bg-muted/80'}`}
              >
                {label}
              </button>
            ))}
          </div>
        </div>

        {lbLoading ? (
          <div className="animate-pulse space-y-2">
            {[1, 2, 3].map((i) => <div key={i} className="h-12 bg-muted rounded-lg" />)}
          </div>
        ) : leaderboard.length === 0 ? (
          <p className="text-muted-foreground text-sm text-center py-6">{t('emptyLeaderboard')}</p>
        ) : (
          <div className="space-y-2">
            {leaderboard.map((entry) => (
              <div key={entry.user_id} className="flex items-center gap-3 rounded-lg border border-border bg-card p-3">
                <span className={`w-6 text-center text-sm font-bold ${entry.rank === 1 ? 'text-yellow-500' : entry.rank === 2 ? 'text-gray-400' : entry.rank === 3 ? 'text-amber-600' : 'text-muted-foreground'}`}>
                  {entry.rank === 1 ? '🥇' : entry.rank === 2 ? '🥈' : entry.rank === 3 ? '🥉' : `#${entry.rank}`}
                </span>
                {entry.avatar_url ? (
                  <Image src={entry.avatar_url} alt={entry.display_name} width={32} height={32} className="rounded-full object-cover" />
                ) : (
                  <div className="w-8 h-8 rounded-full bg-accent/20 flex items-center justify-center text-accent font-bold text-sm">
                    {entry.display_name[0]}
                  </div>
                )}
                <div className="flex-1 min-w-0">
                  <Link href={`/user/${entry.username}`} className="text-sm font-medium hover:underline truncate block">
                    {entry.display_name}
                  </Link>
                  <p className="text-xs text-muted-foreground">{t('xpCount',{count:entry.xp})}</p>
                </div>
                <div className="text-right">
                  <p className="text-sm font-semibold text-accent">{formatter.number(entry.submissions_count)}</p>
                  <p className="text-xs text-muted-foreground">{t('promptCount',{count:entry.submissions_count})}</p>
                </div>
              </div>
            ))}
          </div>
        )}
      </section>

      {/* Past prompts */}
      {pastPrompts.length > 0 && (
        <div>
          <h2 className="font-semibold mb-3">{t('recentPrompts')}</h2>
          <div className="space-y-2">
            {pastPrompts.map((p) => (
              <Link
                key={p.id}
                href={`/write/prompts/${p.id}`}
                className="flex items-start gap-3 rounded-lg border bg-card p-4 hover:shadow-sm transition-shadow"
              >
                <div className="flex-1 min-w-0">
                  <p className="text-xs text-muted-foreground mb-1">{formatter.dateTime(new Date(p.date),{dateStyle:'medium'})}</p>
                  <p className="text-sm line-clamp-2">{p.prompt_text}</p>
                </div>
                <span className="text-muted-foreground text-sm">→</span>
              </Link>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

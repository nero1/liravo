'use client';

import { ChallengeJoinButton } from '@/components/writing/ChallengeJoinButton';
import { useRequestIntent } from '@/lib/client/useRequestIntent';
import { useState, useEffect, useRef } from 'react';
import Link from 'next/link';
import { useTranslations, useFormatter } from 'next-intl';
import { useParams } from 'next/navigation';

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

interface LeaderboardEntry {
  user_id: string;
  total_words: number;
  submission_count: number;
  users: { display_name: string; username: string } | null;
}

interface CommunitySubmission {
  id: string;
  content: string;
  word_count: number | null;
  community_votes: number;
  voted?: boolean;
  submitted_at: string;
  users: { display_name: string; username: string; avatar_url: string | null } | null;
}

export default function ChallengeDetailPage() {
  const t = useTranslations('writing');
  const formatter = useFormatter();
  const intent = useRequestIntent();
  const voteIntents = useRequestIntent();
  const busy = useRef(false);
  const voting = useRef(new Set<string>());
  const params = useParams();
  const id = params.id as string;

  const [challenge, setChallenge] = useState<Challenge | null>(null);
  const [leaderboard, setLeaderboard] = useState<LeaderboardEntry[]>([]);
  const [submissions, setSubmissions] = useState<CommunitySubmission[]>([]);
  const [votedIds, setVotedIds] = useState<Set<string>>(new Set());
  const [votingIds,setVotingIds] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);
  const [loadError,setLoadError] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [form, setForm] = useState({ title: '', body: '' });
  const [voteError,setVoteError] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [submitSuccess, setSubmitSuccess] = useState(false);
  const [joined,setJoined] = useState(false);
  const [aiFeedback, setAiFeedback] = useState<string | null>(null);
  const [aiFeedbackLoading, setAiFeedbackLoading] = useState(false);
  const [submittedBody, setSubmittedBody] = useState('');

  useEffect(() => {
    Promise.all([
      fetch(`/api/write/challenges/${id}`).then(r => { if (!r.ok) throw new Error('Writing request failed'); return r.json(); }),
      fetch(`/api/write/challenges/${id}/submissions`).then(r => { if (!r.ok) throw new Error('Writing request failed'); return r.json(); }),
    ]).then(([data, sData]) => {
      setChallenge(data.challenge);
      setJoined(data.joined === true);
      setLeaderboard(data.leaderboard ?? []);
      const loaded=(sData as { submissions?: CommunitySubmission[] }).submissions ?? [];
      setSubmissions(loaded);
      setVotedIds(new Set(loaded.filter(entry=>entry.voted).map(entry=>entry.id)));
    }).catch(()=>setLoadError(true)).finally(() => setLoading(false));
  }, [id]);

  async function handleVote(submissionId: string) {
    if (voting.current.has(submissionId)) return;
    voting.current.add(submissionId);
    setVoteError(false);
    setVotingIds(prev=>new Set(prev).add(submissionId));
    const payload={voted:!votedIds.has(submissionId)};
    try {
      const response=await fetch(`/api/write/challenges/submissions/${submissionId}/vote`, {method:'POST',headers:{'Content-Type':'application/json',...voteIntents.headers(payload,submissionId)},body:JSON.stringify(payload)});
      const result=await response.json();
      if (!response.ok) throw new Error('Vote unavailable');
      voteIntents.complete(submissionId);
      setVotedIds(prev=>{const next=new Set(prev);if(result.voted) next.add(submissionId);else next.delete(submissionId);return next;});
      setSubmissions(prev=>prev.map(entry=>entry.id===submissionId?{...entry,community_votes:result.community_votes}:entry));
    } catch { setVoteError(true); }
    finally { voting.current.delete(submissionId); setVotingIds(prev=>{const next=new Set(prev);next.delete(submissionId);return next;}); }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (busy.current) return;
    busy.current = true;
    setSubmitting(true);
    setSubmitError(null);
    const wordCount = form.body.trim().split(/\s+/).filter(Boolean).length;
    try {
      const res = await fetch(`/api/write/challenges/${id}/submit`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...intent.headers({id,...form}) },
        body: JSON.stringify({ title: form.title, body: form.body, word_count: wordCount }),
      });
      const data = await res.json();
      if (!res.ok || !data.entry?.id) {
        setSubmitError(t('submitFailure'));
      } else {
        intent.complete();
        setSubmitSuccess(true);
        setSubmittedBody(form.body);
      }
    } catch { setSubmitError(t('submitFailure')); }
    finally { busy.current = false; setSubmitting(false); }
  }

  async function handleGetAiFeedback() {
    if (!submittedBody) return;
    setAiFeedbackLoading(true);
    setAiFeedback(null);
    try {
      const res = await fetch('/api/write/ai-feedback', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: submittedBody, type: 'overall' }),
      });
      const data = await res.json() as { feedback?: string; error?: string };
      if (res.ok) setAiFeedback(data.feedback ?? null);
      else setAiFeedback(t('feedbackFailure'));
    } catch {
      setAiFeedback(t('feedbackFailure'));
    }
    setAiFeedbackLoading(false);
  }

  if (loading) {
    return (
      <div className="max-w-2xl mx-auto px-4 py-8">
        <div className="animate-pulse space-y-4">
          <div className="h-8 bg-muted rounded w-1/2" />
          <div className="h-24 bg-muted rounded" />
        </div>
      </div>
    );
  }

  if (!challenge) {
    return (
      <div className="max-w-2xl mx-auto px-4 py-8 text-center">
        <p role="alert" className="text-muted-foreground">{t(loadError ? 'loadFailure' : 'challengeNotFound')}</p>
        <Link href="/write/challenges" className="text-amber-600 hover:underline text-sm mt-2 inline-block">{t('backChallenges')}</Link>
      </div>
    );
  }

  return (
    <div className="max-w-2xl mx-auto px-4 py-6">
      <Link href="/write/challenges" className="text-sm text-muted-foreground hover:text-foreground mb-4 inline-block">{t('challengeLink')}</Link>

      <div className="rounded-xl border border-amber-200 dark:border-amber-800 bg-amber-50 dark:bg-amber-950/30 p-6 mb-6">
        <span className="text-xs font-medium bg-amber-200 dark:bg-amber-800 text-amber-900 dark:text-amber-100 px-2 py-0.5 rounded-full">
          {challenge.challenge_type === 'weekly' ? t('weekly') : t('monthly')}
        </span>
        <h1 className="font-display text-2xl font-bold text-amber-900 dark:text-amber-100 mt-2">
          {challenge.name}
        </h1>
        {challenge.description && (
          <p className="text-amber-800 dark:text-amber-200 text-sm mt-2">{challenge.description}</p>
        )}
        <div className="flex items-center gap-4 mt-3 text-xs text-muted-foreground">
          <span>
            {t(challenge.goal_type === 'word_count' ? 'goalWords' : 'goalSubmissions',{count:challenge.goal_value})}
          </span>
          <span>{t('ends',{date:formatter.dateTime(new Date(challenge.end_date),{dateStyle:'medium'})})}</span>
          <span>{t('participants',{count:challenge.participant_count})}</span>
        </div>
        <div className="flex gap-2 mt-4">
          <ChallengeJoinButton challengeId={id} initialJoined={joined} onJoined={count=>{setJoined(true);setChallenge(prev=>prev?{...prev,participant_count:count}:prev);}} />
          <Link
            href={`/share/writing-challenge/${challenge.id}`}
            target="_blank"
            className="rounded-lg border px-4 py-2 text-sm hover:bg-muted transition-colors"
          >{t('shareCard')}</Link>
        </div>
      </div>

      {/* Leaderboard */}
      <div className="mb-8">
        <h2 className="font-semibold text-lg mb-3">{t('leaderboard')}</h2>
        {leaderboard.length === 0 ? (
          <p className="text-sm text-muted-foreground">{t('noSubmissions')}</p>
        ) : (
          <div className="space-y-2">
            {leaderboard.map((entry, i) => (
              <div
                key={entry.user_id}
                className="flex items-center gap-3 rounded-lg border bg-card px-4 py-3"
              >
                <span className="text-sm font-bold text-muted-foreground w-5">#{i + 1}</span>
                <Link
                  href={`/user/${entry.users?.username ?? ''}`}
                  className="flex-1 font-medium text-sm hover:underline"
                >
                  {entry.users?.display_name ?? t('unknown')}
                </Link>
                <span className="text-xs text-muted-foreground">
                  {t('submissionCount',{count:entry.submission_count})}
                </span>
                <span className="text-sm font-semibold text-amber-700 dark:text-amber-400">
                  {t('wordCount',{count:entry.total_words})}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>

      {voteError && <p role="alert" className="text-destructive mb-4">{t('voteFailure')}</p>}
      {/* Community submissions */}
      {submissions.length > 0 && (
        <div className="mb-8">
          <h2 className="font-semibold text-lg mb-3">{t('communityEntries')}</h2>
          <div className="space-y-3">
            {submissions.slice(0, 10).map((sub) => (
              <div key={sub.id} className="p-4 rounded-xl border border-border space-y-2">
                <div className="flex items-center justify-between gap-2">
                  <Link
                    href={`/user/${sub.users?.username ?? ''}`}
                    className="text-sm font-medium hover:underline"
                  >
                    {sub.users?.display_name ?? t('unknown')}
                  </Link>
                  <span className="text-xs text-muted-foreground">
                    {t('wordCount',{count:sub.word_count??0})}
                  </span>
                </div>
                <p className="text-sm text-muted-foreground line-clamp-3">{sub.content}</p>
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => handleVote(sub.id)}
                    aria-pressed={votedIds.has(sub.id)}
                    aria-label={t('voteLabel',{count:sub.community_votes})}
                    aria-busy={votingIds.has(sub.id)}
                    disabled={votingIds.has(sub.id)}
                    className={`flex items-center gap-1 text-xs px-2 py-1 rounded-lg border transition-colors ${
                      votedIds.has(sub.id)
                        ? 'border-accent bg-accent/10 text-accent'
                        : 'border-border text-muted-foreground hover:border-accent hover:text-accent'
                    }`}
                  >
                    ♥ {formatter.number(sub.community_votes)}
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Submit entry */}
      <div>
        <h2 className="font-semibold text-lg mb-3">{t('submitEntry')}</h2>
        {submitSuccess ? (
          <div className="space-y-4">
            <div className="rounded-xl bg-green-50 dark:bg-green-950/30 border border-green-200 dark:border-green-800 p-4">
              <p role="status" className="text-green-800 dark:text-green-200 font-medium">
                {t('entrySaved')}
              </p>
            </div>

            {/* AI Feedback section */}
            <div className="rounded-xl border border-amber-200 dark:border-amber-800 p-4 space-y-3">
              <div className="flex items-center justify-between gap-2">
                <div>
                  <p className="font-semibold text-sm">{t('feedbackTitle')}</p>
                  <p className="text-xs text-muted-foreground">{t('feedbackSubtitle')}</p>
                </div>
                {!aiFeedback && (
                  <button
                    onClick={handleGetAiFeedback}
                    disabled={aiFeedbackLoading}
                    className="rounded-lg bg-amber-600 hover:bg-amber-700 disabled:opacity-50 text-white text-xs font-medium px-3 py-1.5 transition-colors flex-shrink-0"
                  >
                    {aiFeedbackLoading ? t('analysing') : t('getFeedback')}
                  </button>
                )}
              </div>
              {aiFeedback && (
                <div className="rounded-lg bg-amber-50 dark:bg-amber-950/20 p-3">
                  <p className="text-sm text-amber-900 dark:text-amber-100 whitespace-pre-wrap">{aiFeedback}</p>
                </div>
              )}
            </div>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-3">
            <div>
              <label className="block text-sm font-medium mb-1" htmlFor="title">{t('entryTitle')}</label>
              <input
                id="title"
                type="text"
                required
                maxLength={200}
                placeholder={t('entryTitlePlaceholder')}
                className="w-full rounded-lg border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-amber-500"
                value={form.title}
                onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))}
              />
            </div>
            <div>
              <label className="block text-sm font-medium mb-1" htmlFor="body">{t('entryBody')}</label>
              <textarea
                maxLength={50000}
                id="body"
                rows={10}
                required
                placeholder={t('entryBodyPlaceholder')}
                className="w-full rounded-lg border bg-background px-3 py-2 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-amber-500"
                value={form.body}
                onChange={(e) => setForm((f) => ({ ...f, body: e.target.value }))}
              />
              <p className="text-xs text-muted-foreground mt-1">
                {t('wordCount',{count:form.body.trim().split(/\s+/).filter(Boolean).length})}
              </p>
            </div>
            {submitError && <p role="alert" className="text-xs text-red-500">{submitError}</p>}
            <button
              type="submit"
              disabled={submitting}
              className="rounded-lg bg-amber-600 hover:bg-amber-700 disabled:opacity-50 text-white text-sm font-medium px-5 py-2 transition-colors"
            >
              {submitting ? t('submitting') : t('submitEntry')}
            </button>
          </form>
        )}
      </div>
    </div>
  );
}

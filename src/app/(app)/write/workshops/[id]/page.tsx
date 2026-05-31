'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';

interface WorkshopRoom {
  id: string;
  name: string;
  topic: string | null;
  max_members: number;
  member_count: number;
}

interface Member {
  user_id: string;
  users: { display_name: string; username: string } | null;
}

interface Submission {
  id: string;
  title: string;
  excerpt: string;
  word_count: number | null;
  created_at: string;
  user_id: string;
  users: { display_name: string; username: string } | null;
  feedback: FeedbackItem[];
}

interface FeedbackItem {
  id: string;
  comment: string;
  created_at: string;
  user_id: string;
  users: { display_name: string; username: string } | null;
}

export default function WorkshopRoomPage() {
  const params = useParams();
  const id = params.id as string;

  const [room, setRoom] = useState<WorkshopRoom | null>(null);
  const [members, setMembers] = useState<Member[]>([]);
  const [submissions, setSubmissions] = useState<Submission[]>([]);
  const [loading, setLoading] = useState(true);
  const [subForm, setSubForm] = useState({ title: '', excerpt: '' });
  const [submitting, setSubmitting] = useState(false);
  const [subSuccess, setSubSuccess] = useState(false);
  const [subError, setSubError] = useState<string | null>(null);
  const [feedbackMap, setFeedbackMap] = useState<Record<string, string>>({});
  const [feedbackSending, setFeedbackSending] = useState<Record<string, boolean>>({});

  useEffect(() => {
    fetch(`/api/write/workshops/${id}`)
      .then((r) => r.json())
      .then((data) => {
        setRoom(data.room);
        setMembers(data.members ?? []);
        setSubmissions(data.submissions ?? []);
      })
      .finally(() => setLoading(false));
  }, [id]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setSubError(null);
    const wordCount = subForm.excerpt.trim().split(/\s+/).filter(Boolean).length;
    const res = await fetch(`/api/write/workshops/${id}/submissions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ title: subForm.title, excerpt: subForm.excerpt, word_count: wordCount }),
    });
    const data = await res.json();
    if (!res.ok) {
      setSubError(data.error ?? 'Submission failed');
    } else {
      setSubSuccess(true);
      const newSub: Submission = {
        ...data.submission,
        users: null,
        feedback: [],
      };
      setSubmissions((s) => [newSub, ...s]);
    }
    setSubmitting(false);
  }

  async function handleFeedback(submissionId: string) {
    const comment = feedbackMap[submissionId];
    if (!comment?.trim()) return;
    setFeedbackSending((s) => ({ ...s, [submissionId]: true }));
    const res = await fetch(`/api/write/workshops/${id}/submissions/${submissionId}/feedback`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ comment }),
    });
    if (res.ok) {
      setFeedbackMap((m) => ({ ...m, [submissionId]: '' }));
    }
    setFeedbackSending((s) => ({ ...s, [submissionId]: false }));
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

  if (!room) {
    return (
      <div className="max-w-2xl mx-auto px-4 py-8 text-center">
        <p className="text-muted-foreground">Room not found.</p>
        <Link href="/write/workshops" className="text-amber-600 hover:underline text-sm mt-2 inline-block">
          ← Back to Workshops
        </Link>
      </div>
    );
  }

  return (
    <div className="max-w-2xl mx-auto px-4 py-6">
      <Link href="/write/workshops" className="text-sm text-muted-foreground hover:text-foreground mb-4 inline-block">
        ← Workshops
      </Link>

      <div className="rounded-xl border border-amber-200 dark:border-amber-800 bg-amber-50 dark:bg-amber-950/30 p-5 mb-6">
        <h1 className="font-display text-2xl font-bold text-amber-900 dark:text-amber-100">
          {room.name}
        </h1>
        {room.topic && (
          <p className="text-amber-800 dark:text-amber-200 text-sm mt-1">{room.topic}</p>
        )}
        <p className="text-xs text-muted-foreground mt-2">
          {room.member_count}/{room.max_members} members
        </p>
      </div>

      {/* Members */}
      <div className="mb-6">
        <h2 className="font-semibold mb-2">Members</h2>
        <div className="flex flex-wrap gap-2">
          {members.map((m) => (
            <Link
              key={m.user_id}
              href={`/user/${m.users?.username ?? ''}`}
              className="text-xs rounded-full border px-3 py-1 hover:bg-muted transition-colors"
            >
              {m.users?.display_name ?? 'Unknown'}
            </Link>
          ))}
          {members.length === 0 && (
            <p className="text-sm text-muted-foreground">No members yet.</p>
          )}
        </div>
      </div>

      {/* Submit for critique */}
      <div className="mb-8">
        <h2 className="font-semibold mb-3">Submit for Critique</h2>
        {subSuccess ? (
          <div className="rounded-xl bg-green-50 dark:bg-green-950/30 border border-green-200 dark:border-green-800 p-4">
            <p className="text-green-800 dark:text-green-200 font-medium">Submitted for critique!</p>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-3">
            <input
              required
              maxLength={200}
              placeholder="Title"
              className="w-full rounded-lg border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-amber-500"
              value={subForm.title}
              onChange={(e) => setSubForm((f) => ({ ...f, title: e.target.value }))}
            />
            <textarea
              required
              rows={6}
              maxLength={1000}
              placeholder="Excerpt (max 1000 characters)..."
              className="w-full rounded-lg border bg-background px-3 py-2 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-amber-500"
              value={subForm.excerpt}
              onChange={(e) => setSubForm((f) => ({ ...f, excerpt: e.target.value }))}
            />
            <div className="flex items-center justify-between">
              <span className="text-xs text-muted-foreground">{subForm.excerpt.length}/1000</span>
              {subError && <span className="text-xs text-red-500">{subError}</span>}
            </div>
            <button
              type="submit"
              disabled={submitting}
              className="rounded-lg bg-amber-600 hover:bg-amber-700 disabled:opacity-50 text-white text-sm font-medium px-5 py-2 transition-colors"
            >
              {submitting ? 'Submitting…' : 'Submit for Critique'}
            </button>
          </form>
        )}
      </div>

      {/* Submissions with feedback */}
      <div>
        <h2 className="font-semibold mb-3">Recent Submissions</h2>
        {submissions.length === 0 ? (
          <p className="text-sm text-muted-foreground">No submissions yet. Be the first!</p>
        ) : (
          <div className="space-y-6">
            {submissions.map((sub) => (
              <div key={sub.id} className="rounded-xl border bg-card p-5">
                <div className="flex items-center justify-between mb-2">
                  <div>
                    <h3 className="font-semibold">{sub.title}</h3>
                    {sub.users && (
                      <Link
                        href={`/user/${sub.users.username}`}
                        className="text-xs text-muted-foreground hover:underline"
                      >
                        by {sub.users.display_name}
                      </Link>
                    )}
                  </div>
                  <span className="text-xs text-muted-foreground">
                    {new Date(sub.created_at).toLocaleDateString()}
                  </span>
                </div>
                <p className="text-sm leading-relaxed text-muted-foreground whitespace-pre-wrap mb-4">
                  {sub.excerpt}
                </p>

                {/* Feedback thread */}
                {(sub.feedback ?? []).length > 0 && (
                  <div className="border-t pt-3 space-y-2 mb-3">
                    {(sub.feedback ?? []).map((fb) => (
                      <div key={fb.id} className="text-sm">
                        <span className="font-medium">
                          {fb.users?.display_name ?? 'Unknown'}:
                        </span>{' '}
                        <span className="text-muted-foreground">{fb.comment}</span>
                      </div>
                    ))}
                  </div>
                )}

                {/* Add feedback */}
                <div className="flex gap-2">
                  <input
                    type="text"
                    placeholder="Add feedback..."
                    maxLength={500}
                    className="flex-1 rounded-lg border bg-background px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-amber-500"
                    value={feedbackMap[sub.id] ?? ''}
                    onChange={(e) =>
                      setFeedbackMap((m) => ({ ...m, [sub.id]: e.target.value }))
                    }
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' && !e.shiftKey) {
                        e.preventDefault();
                        handleFeedback(sub.id);
                      }
                    }}
                  />
                  <button
                    onClick={() => handleFeedback(sub.id)}
                    disabled={feedbackSending[sub.id]}
                    className="rounded-lg bg-amber-600 hover:bg-amber-700 disabled:opacity-50 text-white text-xs font-medium px-3 py-1.5 transition-colors"
                  >
                    {feedbackSending[sub.id] ? '…' : 'Send'}
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

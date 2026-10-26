'use client';

import { useState, useEffect } from 'react';
import Image from 'next/image';
import Link from 'next/link';

interface Application {
  id: string;
  status: string;
  applied_at: string;
  reviewed_at: string | null;
  reader: {
    id: string;
    display_name: string;
    username: string;
    avatar_url: string | null;
    xp: number;
  } | null;
}

interface Arc {
  id: string;
  description: string | null;
  reader_slots: number;
  close_date: string | null;
  is_active: boolean;
  books: { id: string; title: string; author_name: string; cover_url: string | null } | null;
}

export default function ArcDetailPage({ params }: { params: { id: string } }) {
  const { id } = params;
  const [arc, setArc] = useState<Arc | null>(null);
  const [applications, setApplications] = useState<Application[]>([]);
  const [loading, setLoading] = useState(true);
  const [reviewing, setReviewing] = useState<string | null>(null);

  useEffect(() => {
    Promise.all([
      fetch(`/api/author/arcs?authorId=me`).then((r) => r.json()),
      fetch(`/api/author/arcs/${id}/applications`).then((r) => r.json()),
    ]).then(([arcData, appData]) => {
      const myArcs = (arcData as { arcs?: Arc[] }).arcs ?? [];
      const found = myArcs.find((a: Arc) => a.id === id) ?? null;
      setArc(found);
      setApplications((appData as { applications?: Application[] }).applications ?? []);
    }).finally(() => setLoading(false));
  }, [id]);

  async function handleReview(applicationId: string, status: 'approved' | 'rejected') {
    setReviewing(applicationId);
    const res = await fetch(`/api/author/arcs/${id}/approve`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ applicationId, approved: status === 'approved' }),
    });
    const data = await res.json() as { approved?: boolean; error?: string };
    if (res.ok) {
      setApplications((prev) =>
        prev.map((a) => a.id === applicationId ? { ...a, status, reviewed_at: new Date().toISOString() } : a)
      );
    } else {
      alert(data.error ?? 'Failed to review');
    }
    setReviewing(null);
  }

  if (loading) {
    return (
      <div className="max-w-2xl mx-auto px-4 py-8 space-y-4 animate-pulse">
        <div className="h-8 bg-muted rounded w-1/2" />
        <div className="h-32 bg-muted rounded" />
      </div>
    );
  }

  const pending = applications.filter((a) => a.status === 'pending');
  const approved = applications.filter((a) => a.status === 'approved');
  const rejected = applications.filter((a) => a.status === 'rejected');

  return (
    <div className="max-w-2xl mx-auto px-4 py-6 space-y-6">
      <Link href="/author/arcs" className="text-sm text-muted-foreground hover:text-foreground">
        ← My ARCs
      </Link>

      {arc && (
        <div className="rounded-xl border border-border bg-card p-5 flex gap-4">
          {arc.books?.cover_url && (
            <div className="relative w-16 h-24 flex-shrink-0">
              <Image src={arc.books.cover_url} alt={arc.books.title} fill className="object-cover rounded-md" sizes="64px" />
            </div>
          )}
          <div className="flex-1">
            <h1 className="font-display text-xl font-bold">{arc.books?.title ?? 'ARC'}</h1>
            <p className="text-sm text-muted-foreground">{arc.books?.author_name}</p>
            {arc.description && <p className="text-sm text-muted-foreground mt-2">{arc.description}</p>}
            <div className="flex gap-4 mt-3 text-xs text-muted-foreground">
              <span>{approved.length}/{arc.reader_slots} approved</span>
              <span>{pending.length} pending</span>
              {arc.close_date && <span>Closes {new Date(arc.close_date).toLocaleDateString()}</span>}
            </div>
          </div>
        </div>
      )}

      {/* Pending applications */}
      {pending.length > 0 && (
        <section className="space-y-3">
          <h2 className="font-semibold text-lg">Pending ({pending.length})</h2>
          {pending.map((app) => (
            <div key={app.id} className="rounded-xl border border-amber-200 dark:border-amber-800 bg-amber-50 dark:bg-amber-950/20 p-4">
              <div className="flex items-start gap-3">
                {app.reader?.avatar_url ? (
                  <Image src={app.reader.avatar_url} alt={app.reader.display_name} width={40} height={40} className="rounded-full object-cover flex-shrink-0" />
                ) : (
                  <div className="w-10 h-10 rounded-full bg-accent/20 flex items-center justify-center text-accent font-bold flex-shrink-0">
                    {(app.reader?.display_name ?? '?')[0].toUpperCase()}
                  </div>
                )}
                <div className="flex-1 min-w-0">
                  <Link href={`/user/${app.reader?.username ?? ''}`} className="font-semibold text-sm hover:underline">
                    {app.reader?.display_name ?? 'Unknown'}
                  </Link>
                  <p className="text-xs text-muted-foreground">@{app.reader?.username} · {(app.reader?.xp ?? 0).toLocaleString()} XP</p>
                  <p className="text-xs text-muted-foreground mt-1">Applied {new Date(app.applied_at).toLocaleDateString()}</p>
                </div>
                <div className="flex gap-2 flex-shrink-0">
                  <button
                    onClick={() => handleReview(app.id, 'rejected')}
                    disabled={reviewing === app.id}
                    className="rounded-lg border border-red-200 dark:border-red-800 text-red-600 dark:text-red-400 text-xs font-medium px-3 py-1.5 hover:bg-red-50 dark:hover:bg-red-950 transition-colors disabled:opacity-50"
                  >
                    Decline
                  </button>
                  <button
                    onClick={() => handleReview(app.id, 'approved')}
                    disabled={reviewing === app.id || approved.length >= (arc?.reader_slots ?? 0)}
                    className="rounded-lg bg-green-600 hover:bg-green-700 text-white text-xs font-medium px-3 py-1.5 transition-colors disabled:opacity-50"
                  >
                    {reviewing === app.id ? '…' : 'Approve'}
                  </button>
                </div>
              </div>
            </div>
          ))}
        </section>
      )}

      {/* Approved readers */}
      {approved.length > 0 && (
        <section className="space-y-3">
          <h2 className="font-semibold text-lg">Approved Readers ({approved.length})</h2>
          {approved.map((app) => (
            <div key={app.id} className="rounded-xl border border-green-200 dark:border-green-800 bg-green-50 dark:bg-green-950/20 p-4 flex items-center gap-3">
              {app.reader?.avatar_url ? (
                <Image src={app.reader.avatar_url} alt={app.reader.display_name} width={36} height={36} className="rounded-full object-cover flex-shrink-0" />
              ) : (
                <div className="w-9 h-9 rounded-full bg-accent/20 flex items-center justify-center text-accent font-bold flex-shrink-0 text-sm">
                  {(app.reader?.display_name ?? '?')[0].toUpperCase()}
                </div>
              )}
              <div className="flex-1">
                <Link href={`/user/${app.reader?.username ?? ''}`} className="font-semibold text-sm hover:underline">
                  {app.reader?.display_name ?? 'Unknown'}
                </Link>
                <p className="text-xs text-muted-foreground">Approved {new Date(app.reviewed_at ?? app.applied_at).toLocaleDateString()}</p>
              </div>
              <span className="text-xs font-medium text-green-600 dark:text-green-400">✓ Approved</span>
            </div>
          ))}
        </section>
      )}

      {/* Rejected */}
      {rejected.length > 0 && (
        <section className="space-y-2">
          <h2 className="font-semibold text-sm text-muted-foreground">Declined ({rejected.length})</h2>
          {rejected.map((app) => (
            <div key={app.id} className="rounded-lg border border-border p-3 flex items-center gap-3 opacity-60">
              <div className="w-8 h-8 rounded-full bg-muted flex items-center justify-center text-muted-foreground text-xs font-bold flex-shrink-0">
                {(app.reader?.display_name ?? '?')[0].toUpperCase()}
              </div>
              <span className="text-sm text-muted-foreground">{app.reader?.display_name ?? 'Unknown'}</span>
            </div>
          ))}
        </section>
      )}

      {applications.length === 0 && (
        <div className="text-center py-12">
          <p className="text-muted-foreground">No applications yet.</p>
          <p className="text-muted-foreground text-sm mt-1">Share your ARC link to get readers interested!</p>
        </div>
      )}
    </div>
  );
}

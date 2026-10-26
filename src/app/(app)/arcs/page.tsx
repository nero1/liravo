'use client';

import { useState, useEffect } from 'react';
import Image from 'next/image';
import Link from 'next/link';

interface ArcBook {
  id: string;
  title: string;
  author_name: string;
  cover_url: string | null;
}

interface ArcAuthor {
  id: string;
  display_name: string;
  username: string;
  avatar_url: string | null;
}

interface Arc {
  id: string;
  description: string | null;
  reader_slots: number;
  close_date: string | null;
  created_at: string;
  books: ArcBook | null;
  author: ArcAuthor | null;
  my_application_status: string | null;
  approved_count: number;
  slots_remaining: number;
}

export default function ArcsPage() {
  const [arcs, setArcs] = useState<Arc[]>([]);
  const [loading, setLoading] = useState(true);
  const [applying, setApplying] = useState<string | null>(null);
  const [applied, setApplied] = useState<Record<string, string>>({});

  useEffect(() => {
    fetch('/api/arcs')
      .then((r) => r.json())
      .then((d: { arcs?: Arc[] }) => setArcs(d.arcs ?? []))
      .catch(() => null)
      .finally(() => setLoading(false));
  }, []);

  async function handleApply(arcId: string) {
    setApplying(arcId);
    const res = await fetch(`/api/author/arcs/${arcId}/apply`, { method: 'POST' });
    const data = await res.json() as { error?: string };
    if (res.ok) {
      setApplied((prev) => ({ ...prev, [arcId]: 'pending' }));
      setArcs((prev) => prev.map((a) => a.id === arcId ? { ...a, my_application_status: 'pending' } : a));
    } else {
      alert(data.error ?? 'Could not apply');
    }
    setApplying(null);
  }

  const statusBadge = (status: string | null) => {
    if (!status) return null;
    const styles = {
      pending: 'bg-amber-100 text-amber-700 dark:bg-amber-900 dark:text-amber-300',
      approved: 'bg-green-100 text-green-700 dark:bg-green-900 dark:text-green-300',
      rejected: 'bg-red-100 text-red-700 dark:bg-red-900 dark:text-red-300',
    }[status] ?? 'bg-muted text-muted-foreground';
    return (
      <span className={`text-xs font-medium px-2 py-0.5 rounded-full capitalize ${styles}`}>
        {status}
      </span>
    );
  };

  return (
    <div className="max-w-2xl mx-auto px-4 py-6 space-y-6">
      <div>
        <h1 className="font-display text-2xl font-bold">Advance Reader Copies</h1>
        <p className="text-muted-foreground text-sm mt-1">
          Apply to read books before they&apos;re published and share your honest feedback.
        </p>
      </div>

      {loading ? (
        <div className="space-y-4">
          {[1, 2, 3].map((i) => (
            <div key={i} className="h-40 bg-muted rounded-xl animate-pulse" />
          ))}
        </div>
      ) : arcs.length === 0 ? (
        <div className="text-center py-16">
          <p className="text-muted-foreground text-lg">No ARCs available right now.</p>
          <p className="text-muted-foreground text-sm mt-1">Check back soon!</p>
        </div>
      ) : (
        <div className="space-y-4">
          {arcs.map((arc) => {
            const isFull = arc.slots_remaining <= 0;
            const appStatus = arc.my_application_status ?? applied[arc.id] ?? null;

            return (
              <div key={arc.id} className="rounded-xl border border-border bg-card p-5 space-y-4">
                <div className="flex gap-4">
                  {arc.books?.cover_url ? (
                    <div className="relative w-16 h-24 flex-shrink-0">
                      <Image
                        src={arc.books.cover_url}
                        alt={arc.books.title}
                        fill
                        className="object-cover rounded-md"
                        sizes="64px"
                      />
                    </div>
                  ) : (
                    <div className="w-16 h-24 rounded-md bg-muted flex-shrink-0" />
                  )}
                  <div className="flex-1 min-w-0 space-y-1">
                    <Link
                      href={`/book/${arc.books?.id ?? ''}`}
                      className="font-semibold text-foreground hover:text-accent line-clamp-2"
                    >
                      {arc.books?.title ?? 'Unknown Book'}
                    </Link>
                    <p className="text-sm text-muted-foreground">{arc.books?.author_name}</p>
                    <div className="flex items-center gap-2 flex-wrap">
                      <Link href={`/author/${arc.author?.username ?? ''}`} className="text-xs text-accent hover:underline">
                        by {arc.author?.display_name ?? 'Unknown Author'}
                      </Link>
                      {appStatus && statusBadge(appStatus)}
                    </div>
                  </div>
                </div>

                {arc.description && (
                  <p className="text-sm text-muted-foreground">{arc.description}</p>
                )}

                <div className="flex items-center justify-between gap-2 flex-wrap">
                  <div className="flex items-center gap-4 text-xs text-muted-foreground">
                    <span>{arc.approved_count}/{arc.reader_slots} slots filled</span>
                    {arc.close_date && (
                      <span>Closes {new Date(arc.close_date).toLocaleDateString()}</span>
                    )}
                    {isFull && <span className="text-red-500 font-medium">Fully booked</span>}
                  </div>

                  {!appStatus && (
                    <button
                      onClick={() => handleApply(arc.id)}
                      disabled={applying === arc.id || isFull}
                      className="rounded-lg bg-accent text-white text-sm font-medium px-4 py-2 disabled:opacity-50 hover:opacity-90 transition-opacity"
                    >
                      {applying === arc.id ? 'Applying…' : isFull ? 'Full' : 'Apply for ARC'}
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

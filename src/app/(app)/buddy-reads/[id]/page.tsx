'use client';

import { useState, useEffect, use } from 'react';
import Image from 'next/image';
import Link from 'next/link';

interface Participant {
  id: string;
  username: string;
  display_name: string;
  avatar_url: string | null;
}

interface Note {
  id: string;
  user_id: string;
  content: string;
  created_at: string;
  user?: { display_name: string; username: string; avatar_url: string | null };
}

interface BuddyRead {
  id: string;
  book_id: string;
  max_participants: number;
  current_chapter: number;
  is_active: boolean;
  created_by: string;
}

interface Book {
  id: string;
  title: string;
  author_name: string;
  cover_url: string | null;
}

export default function BuddyReadRoomPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);

  const [buddyRead, setBuddyRead] = useState<BuddyRead | null>(null);
  const [book, setBook] = useState<Book | null>(null);
  const [participants, setParticipants] = useState<Participant[]>([]);
  const [notes, setNotes] = useState<Note[]>([]);
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [noteInput, setNoteInput] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [replyingTo, setReplyingTo] = useState<string | null>(null);
  const [replyInput, setReplyInput] = useState('');

  useEffect(() => {
    async function load() {
      const [brRes, notesRes, meRes] = await Promise.all([
        fetch(`/api/buddy-reads/${id}`),
        fetch(`/api/buddy-reads/${id}/notes`),
        fetch('/api/users/me'),
      ]);
      if (brRes.ok) {
        const d = await brRes.json() as { buddyRead?: BuddyRead; book?: Book; participants?: Participant[] };
        setBuddyRead(d.buddyRead ?? null);
        setBook(d.book ?? null);
        setParticipants(d.participants ?? []);
      }
      if (notesRes.ok) {
        const d = await notesRes.json() as { notes?: Note[] };
        setNotes(d.notes ?? []);
      }
      if (meRes.ok) {
        const d = await meRes.json() as { user?: { id: string }; id?: string };
        setCurrentUserId(d.user?.id ?? d.id ?? null);
      }
      setLoading(false);
    }
    load();
  }, [id]);

  const isParticipant = currentUserId ? participants.some((p) => p.id === currentUserId) : false;

  async function postNote(content: string, replyToId: string | null = null) {
    if (!content.trim()) return;
    setSubmitting(true);
    const res = await fetch(`/api/buddy-reads/${id}/notes`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ content: content.trim(), reply_to_id: replyToId }),
    });
    if (res.ok) {
      const d = await res.json() as { note?: Note };
      if (d.note) {
        setNotes((prev) => [d.note!, ...prev]);
      }
      setNoteInput('');
      setReplyInput('');
      setReplyingTo(null);
    }
    setSubmitting(false);
  }

  async function joinBuddyRead() {
    await fetch(`/api/buddy-reads/${id}/join`, { method: 'POST' });
    window.location.reload();
  }

  if (loading) {
    return (
      <div className="max-w-2xl mx-auto px-4 py-8 animate-pulse space-y-4">
        <div className="h-24 bg-muted rounded-xl" />
        <div className="h-32 bg-muted rounded-xl" />
      </div>
    );
  }

  if (!buddyRead) {
    return (
      <div className="max-w-2xl mx-auto px-4 py-8 text-center text-muted-foreground">
        <p>Buddy read not found.</p>
        <Link href="/buddy-reads" className="text-accent hover:underline text-sm mt-2 inline-block">← Back</Link>
      </div>
    );
  }

  return (
    <div className="max-w-2xl mx-auto px-4 py-8 space-y-6">
      <Link href="/buddy-reads" className="text-sm text-muted-foreground hover:text-foreground">
        ← Buddy Reads
      </Link>

      {/* Book info */}
      <div className="flex items-start gap-4">
        {book?.cover_url && (
          <div className="relative w-16 h-24 flex-shrink-0">
            <Image src={book.cover_url} alt={book.title} fill className="object-cover rounded-md" sizes="64px" />
          </div>
        )}
        <div className="flex-1 min-w-0">
          <h1 className="font-display text-2xl font-bold">{book?.title ?? 'Buddy Read'}</h1>
          {book && <p className="text-muted-foreground text-sm">{book.author_name}</p>}
          <div className="flex items-center gap-3 mt-2 text-sm flex-wrap">
            <span className="text-muted-foreground">
              Chapter <span className="font-semibold text-foreground">{buddyRead.current_chapter}</span>
            </span>
            <span className="text-muted-foreground">
              {participants.length}/{buddyRead.max_participants} readers
            </span>
            <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${buddyRead.is_active ? 'bg-green-100 text-green-700 dark:bg-green-900 dark:text-green-300' : 'bg-muted text-muted-foreground'}`}>
              {buddyRead.is_active ? 'Active' : 'Ended'}
            </span>
          </div>
        </div>
      </div>

      {/* Participants */}
      <section>
        <h2 className="font-semibold text-lg mb-3">Readers</h2>
        <div className="flex gap-2 flex-wrap">
          {participants.map((p) => (
            <Link
              key={p.id}
              href={`/user/${p.username}`}
              className="flex items-center gap-2 px-3 py-1.5 rounded-lg border border-border hover:border-accent transition-colors text-sm"
            >
              {p.avatar_url ? (
                <Image src={p.avatar_url} alt={p.display_name} width={20} height={20} className="rounded-full object-cover" />
              ) : (
                <div className="w-5 h-5 rounded-full bg-accent/20 flex items-center justify-center text-accent text-[10px] font-bold">
                  {p.display_name[0]}
                </div>
              )}
              <span>{p.display_name}</span>
              {p.id === currentUserId && <span className="text-xs text-muted-foreground">(you)</span>}
            </Link>
          ))}
        </div>
      </section>

      {/* Discussion */}
      <section>
        <h2 className="font-semibold text-lg mb-3">Discussion</h2>

        {isParticipant && (
          <div className="mb-4 flex gap-2">
            <textarea
              rows={2}
              placeholder="Share a thought, question, or reaction…"
              value={noteInput}
              onChange={(e) => setNoteInput(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) { postNote(noteInput); } }}
              className="flex-1 rounded-lg border border-border bg-background px-3 py-2 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-accent"
            />
            <button
              onClick={() => postNote(noteInput)}
              disabled={submitting || !noteInput.trim()}
              className="px-4 py-2 rounded-lg bg-accent text-white text-sm font-semibold hover:opacity-90 disabled:opacity-50 self-end"
            >
              Post
            </button>
          </div>
        )}

        {notes.length === 0 ? (
          <p className="text-muted-foreground text-sm">No discussion yet. Start the conversation!</p>
        ) : (
          <div className="space-y-3">
            {notes.map((note) => (
              <div key={note.id} className="rounded-xl border border-border bg-card p-4">
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center gap-2">
                    {note.user?.avatar_url ? (
                      <Image src={note.user.avatar_url} alt={note.user.display_name} width={24} height={24} className="rounded-full object-cover" />
                    ) : (
                      <div className="w-6 h-6 rounded-full bg-accent/20 flex items-center justify-center text-accent text-xs font-bold">
                        {(note.user?.display_name ?? '?')[0].toUpperCase()}
                      </div>
                    )}
                    <span className="text-sm font-medium">
                      {note.user?.display_name ?? 'Unknown'}
                    </span>
                  </div>
                  <span className="text-xs text-muted-foreground">
                    {new Date(note.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                  </span>
                </div>
                <p className="text-sm text-foreground">{note.content}</p>
                {isParticipant && (
                  <button
                    onClick={() => setReplyingTo(replyingTo === note.id ? null : note.id)}
                    className="mt-2 text-xs text-muted-foreground hover:text-accent transition-colors"
                  >
                    Reply
                  </button>
                )}
                {replyingTo === note.id && (
                  <div className="mt-2 flex gap-2">
                    <input
                      type="text"
                      placeholder="Write a reply…"
                      value={replyInput}
                      onChange={(e) => setReplyInput(e.target.value)}
                      onKeyDown={(e) => { if (e.key === 'Enter') { postNote(replyInput, note.id); } }}
                      className="flex-1 rounded-lg border border-border bg-background px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-accent"
                      autoFocus
                    />
                    <button
                      onClick={() => postNote(replyInput, note.id)}
                      disabled={submitting || !replyInput.trim()}
                      className="px-3 py-1.5 rounded-lg bg-accent text-white text-xs font-semibold disabled:opacity-50"
                    >
                      Reply
                    </button>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </section>

      {!isParticipant && buddyRead.is_active && participants.length < buddyRead.max_participants && (
        <div className="text-center pt-4">
          <button
            onClick={joinBuddyRead}
            className="px-6 py-2.5 rounded-lg bg-accent text-white font-semibold hover:opacity-90 transition-opacity"
          >
            Join this Buddy Read
          </button>
        </div>
      )}
    </div>
  );
}

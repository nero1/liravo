import { createClient } from '@/lib/supabase/server';
import { notFound, redirect } from 'next/navigation';
import Image from 'next/image';
import Link from 'next/link';
import type { Metadata } from 'next';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = { title: 'Buddy Read' };

interface Note {
  id: string;
  user_id: string;
  content: string;
  created_at: string;
}

export default async function BuddyReadRoomPage({
  params,
}: {
  params: { id: string };
}) {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect('/auth/login');

  const { data: buddyRead } = await supabase
    .from('buddy_reads')
    .select('id, book_id, max_participants, current_chapter, is_active, created_by, created_at')
    .eq('id', params.id)
    .single();

  if (!buddyRead) notFound();

  const { data: participantsRaw } = await supabase
    .from('buddy_read_participants')
    .select('user_id, joined_at')
    .eq('buddy_read_id', params.id);

  const participantIds = ((participantsRaw ?? []) as Array<{ user_id: string }>).map(
    (p) => p.user_id
  );

  // Check current user is a participant
  const isParticipant = participantIds.includes(user.id);

  // Get participant profiles
  let participants: Array<{
    id: string;
    username: string;
    display_name: string;
    avatar_url: string | null;
  }> = [];
  if (participantIds.length > 0) {
    const { data: profiles } = await supabase
      .from('users')
      .select('id, username, display_name, avatar_url')
      .in('id', participantIds);
    participants = profiles ?? [];
  }

  // Get book details
  const { data: book } = await supabase
    .from('books')
    .select('id, title, author_name, cover_url')
    .eq('id', buddyRead.book_id)
    .single();

  // Get shared notes
  const { data: notesRaw } = await supabase
    .from('buddy_read_notes')
    .select('id, user_id, content, created_at')
    .eq('buddy_read_id', params.id)
    .order('created_at', { ascending: false })
    .limit(20);

  const notes: Note[] = notesRaw ?? [];

  // Build user map for notes
  const noteUserIds = Array.from(new Set(notes.map((n) => n.user_id)));
  const noteUserMap: Record<string, string> = {};
  if (noteUserIds.length > 0) {
    const { data: noteUsers } = await supabase
      .from('users')
      .select('id, display_name')
      .in('id', noteUserIds);
    for (const u of noteUsers ?? []) {
      noteUserMap[u.id] = u.display_name;
    }
  }

  return (
    <div className="max-w-2xl mx-auto px-4 py-8 space-y-6">
      {/* Book info */}
      <div className="flex items-start gap-4">
        {book?.cover_url && (
          <div className="relative w-16 h-24 flex-shrink-0">
            <Image
              src={book.cover_url}
              alt={book.title}
              fill
              className="object-cover rounded-md"
              sizes="64px"
            />
          </div>
        )}
        <div className="flex-1 min-w-0">
          <h1 className="font-display text-2xl font-bold">{book?.title ?? 'Buddy Read'}</h1>
          {book && (
            <p className="text-neutral-500 dark:text-neutral-400 text-sm">{book.author_name}</p>
          )}
          <div className="flex items-center gap-3 mt-2 text-sm">
            <span className="text-neutral-500">
              Chapter <span className="font-semibold text-foreground">{buddyRead.current_chapter}</span>
            </span>
            <span className="text-neutral-500">
              {participants.length}/{buddyRead.max_participants} participants
            </span>
            <span
              className={`text-xs font-medium px-2 py-0.5 rounded-full ${
                buddyRead.is_active
                  ? 'bg-green-100 text-green-700 dark:bg-green-900 dark:text-green-300'
                  : 'bg-neutral-100 text-neutral-500 dark:bg-neutral-800'
              }`}
            >
              {buddyRead.is_active ? 'Active' : 'Ended'}
            </span>
          </div>
        </div>
      </div>

      {/* Participants */}
      <section>
        <h2 className="font-display text-lg font-bold mb-3">Participants</h2>
        <div className="flex gap-3 flex-wrap">
          {participants.map((p) => (
            <Link
              key={p.id}
              href={`/user/${p.username}`}
              className="flex items-center gap-2 px-3 py-2 rounded-lg border border-neutral-200 dark:border-neutral-700 hover:border-accent transition-colors text-sm"
            >
              {p.avatar_url ? (
                <Image
                  src={p.avatar_url}
                  alt={p.display_name}
                  width={24}
                  height={24}
                  className="rounded-full object-cover"
                />
              ) : (
                <div className="w-6 h-6 rounded-full bg-accent flex items-center justify-center text-white text-xs font-bold">
                  {p.display_name[0]}
                </div>
              )}
              <span>{p.display_name}</span>
              {p.id === user.id && (
                <span className="text-xs text-neutral-400">(you)</span>
              )}
            </Link>
          ))}
        </div>
      </section>

      {/* Shared Notes */}
      <section>
        <h2 className="font-display text-lg font-bold mb-3">Shared Notes</h2>

        {isParticipant && (
          <form
            action={`/api/buddy-reads/${params.id}/update`}
            method="PATCH"
            className="mb-4"
          >
            <div className="flex gap-2">
              <input
                type="text"
                name="note"
                placeholder="Add a note..."
                className="flex-1 rounded-lg border border-neutral-300 dark:border-neutral-700 bg-white dark:bg-neutral-900 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-accent"
              />
              <button
                type="submit"
                className="px-4 py-2 rounded-lg bg-accent text-white text-sm font-semibold hover:opacity-90"
              >
                Add
              </button>
            </div>
          </form>
        )}

        {notes.length === 0 ? (
          <p className="text-neutral-500 dark:text-neutral-400 text-sm">
            No notes yet. Be the first to add one!
          </p>
        ) : (
          <div className="space-y-3">
            {notes.map((note) => (
              <div
                key={note.id}
                className="rounded-lg border border-neutral-200 dark:border-neutral-700 bg-white dark:bg-neutral-900 p-3"
              >
                <div className="flex items-center justify-between mb-1">
                  <span className="text-xs font-semibold">
                    {noteUserMap[note.user_id] ?? 'Unknown'}
                  </span>
                  <span className="text-xs text-neutral-500">
                    {new Date(note.created_at).toLocaleDateString()}
                  </span>
                </div>
                <p className="text-sm text-neutral-700 dark:text-neutral-300">{note.content}</p>
              </div>
            ))}
          </div>
        )}
      </section>

      {!isParticipant && buddyRead.is_active && participants.length < buddyRead.max_participants && (
        <div className="text-center pt-4">
          <form action={`/api/buddy-reads/${params.id}/join`} method="POST">
            <button
              type="submit"
              className="px-6 py-2.5 rounded-lg bg-accent text-white font-semibold hover:opacity-90 transition-opacity"
            >
              Join this Buddy Read
            </button>
          </form>
        </div>
      )}
    </div>
  );
}

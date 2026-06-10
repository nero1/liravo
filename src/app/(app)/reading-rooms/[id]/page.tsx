import { createClient } from '@/lib/supabase/server';
import { notFound, redirect } from 'next/navigation';
import Image from 'next/image';
import Link from 'next/link';
import type { Metadata } from 'next';
import { RoomBoard } from '@/components/reading-rooms/RoomBoard';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = { title: 'Reading Room' };

export default async function ReadingRoomPage({
  params,
}: {
  params: { id: string };
}) {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect('/auth/login');

  const { data: room } = await supabase
    .from('reading_rooms')
    .select('id, name, book_id, is_public, created_by, is_active, created_at')
    .eq('id', params.id)
    .single();

  if (!room) notFound();

  const [{ data: participantsRaw }, { data: book }] = await Promise.all([
    supabase.from('room_participants').select('user_id, joined_at').eq('room_id', params.id),
    room.book_id
      ? supabase.from('books').select('id, title, author_name, cover_url').eq('id', room.book_id).single()
      : Promise.resolve({ data: null }),
  ]);

  const participantIds = ((participantsRaw ?? []) as Array<{ user_id: string }>).map((p) => p.user_id);

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

  const isCreator = room.created_by === user.id;
  const isMember = participantIds.includes(user.id);

  return (
    <div className="max-w-2xl mx-auto px-4 py-8 space-y-6">
      {/* Back link */}
      <Link href="/reading-rooms" className="text-sm text-muted-foreground hover:text-foreground inline-flex items-center gap-1">
        ← Reading Rooms
      </Link>

      {/* Room header */}
      <div className="flex items-start gap-4">
        {(book as { cover_url?: string | null } | null)?.cover_url && (
          <div className="relative w-16 h-24 flex-shrink-0">
            <Image
              src={(book as { cover_url: string }).cover_url}
              alt={(book as { title: string }).title}
              fill
              className="object-cover rounded-md"
              sizes="64px"
            />
          </div>
        )}
        <div className="flex-1 min-w-0">
          <h1 className="font-display text-2xl font-bold">{room.name}</h1>
          {book && (
            <Link
              href={`/book/${(book as { id: string }).id}`}
              className="text-sm text-accent hover:underline"
            >
              {(book as { title: string; author_name: string }).title} by {(book as { title: string; author_name: string }).author_name}
            </Link>
          )}
          <div className="flex items-center gap-3 mt-2 flex-wrap">
            <span
              className={`text-xs font-medium px-2 py-0.5 rounded-full ${
                room.is_active
                  ? 'bg-green-100 text-green-700 dark:bg-green-900 dark:text-green-300'
                  : 'bg-neutral-100 text-neutral-500 dark:bg-neutral-800'
              }`}
            >
              {room.is_active ? 'Active' : 'Closed'}
            </span>
            {isCreator && (
              <span className="text-xs font-medium px-2 py-0.5 rounded-full bg-amber-100 text-amber-700 dark:bg-amber-900 dark:text-amber-300">
                Creator
              </span>
            )}
            <span className="text-xs text-neutral-500">
              {participants.length} participant{participants.length !== 1 ? 's' : ''}
            </span>
          </div>
        </div>
      </div>

      {/* Participants */}
      <section>
        <h2 className="font-display text-lg font-bold mb-3">Participants</h2>
        {participants.length === 0 ? (
          <p className="text-neutral-500 dark:text-neutral-400 text-sm">No participants yet.</p>
        ) : (
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
              </Link>
            ))}
          </div>
        )}
      </section>

      {/* Join button for non-members */}
      {!isMember && !isCreator && room.is_active && (
        <div>
          <form action={`/api/reading-rooms/${params.id}/join`} method="POST">
            <button
              type="submit"
              className="px-6 py-2.5 rounded-lg bg-accent text-white font-semibold hover:opacity-90 transition-opacity"
            >
              Join Room
            </button>
          </form>
        </div>
      )}

      {/* Interactive discussion + milestones board */}
      <section>
        <h2 className="font-display text-lg font-bold mb-4">Room Discussion</h2>
        <RoomBoard
          roomId={params.id}
          isCreator={isCreator}
          isMember={isMember || isCreator}
          currentUserId={user.id}
        />
      </section>
    </div>
  );
}

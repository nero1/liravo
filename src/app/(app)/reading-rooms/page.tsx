import { createClient } from '@/lib/supabase/server';
import { redirect } from 'next/navigation';
import Link from 'next/link';
import Image from 'next/image';
import type { Metadata } from 'next';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = { title: 'Reading Rooms' };

interface ReadingRoom {
  id: string;
  name: string;
  book_id: string | null;
  is_public: boolean;
  created_by: string;
  is_active: boolean;
  created_at: string;
}

export default async function ReadingRoomsPage() {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect('/auth/login');

  const { data: roomsRaw } = await supabase
    .from('reading_rooms')
    .select('id, name, book_id, is_public, created_by, is_active, created_at')
    .eq('is_active', true)
    .eq('is_public', true)
    .order('created_at', { ascending: false })
    .limit(30);

  const rooms: ReadingRoom[] = roomsRaw ?? [];

  // Get book details
  const bookIds = Array.from(new Set(rooms.filter((r) => r.book_id).map((r) => r.book_id as string)));
  const bookMap: Record<string, { title: string; cover_url: string | null }> = {};
  if (bookIds.length > 0) {
    const { data: books } = await supabase
      .from('books')
      .select('id, title, cover_url')
      .in('id', bookIds);
    for (const b of books ?? []) {
      bookMap[b.id] = { title: b.title, cover_url: b.cover_url };
    }
  }

  return (
    <div className="max-w-2xl mx-auto px-4 py-8 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="font-display text-2xl font-bold">Reading Rooms</h1>
          <p className="text-neutral-500 dark:text-neutral-400 text-sm mt-1">
            Read together in real time with other readers.
          </p>
        </div>
        <Link
          href="/reading-rooms/new"
          className="px-4 py-2 rounded-lg bg-accent text-white text-sm font-semibold hover:opacity-90"
        >
          + New Room
        </Link>
      </div>

      {rooms.length === 0 ? (
        <div className="text-center py-12">
          <p className="text-neutral-500 dark:text-neutral-400 mb-4">
            No active reading rooms yet.
          </p>
          <Link
            href="/reading-rooms/new"
            className="px-4 py-2 rounded-lg bg-accent text-white font-medium hover:opacity-90"
          >
            Create a Reading Room
          </Link>
        </div>
      ) : (
        <div className="space-y-3">
          {rooms.map((room) => {
            const book = room.book_id ? bookMap[room.book_id] : null;
            return (
              <div
                key={room.id}
                className="rounded-xl border border-neutral-200 dark:border-neutral-700 bg-white dark:bg-neutral-900 p-4"
              >
                <div className="flex items-start gap-3">
                  {book?.cover_url && (
                    <div className="relative w-10 h-14 flex-shrink-0">
                      <Image
                        src={book.cover_url}
                        alt={book.title}
                        fill
                        className="object-cover rounded"
                        sizes="40px"
                      />
                    </div>
                  )}
                  <div className="flex-1 min-w-0">
                    <h3 className="font-semibold text-sm">{room.name}</h3>
                    {book && (
                      <p className="text-xs text-neutral-500 dark:text-neutral-400">
                        {book.title}
                      </p>
                    )}
                    <span className="text-xs text-neutral-400 dark:text-neutral-500">
                      {new Date(room.created_at).toLocaleDateString()}
                    </span>
                  </div>
                  <Link
                    href={`/reading-rooms/${room.id}`}
                    className="px-3 py-1.5 rounded-lg bg-accent text-white text-xs font-semibold hover:opacity-90 flex-shrink-0"
                  >
                    Enter
                  </Link>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

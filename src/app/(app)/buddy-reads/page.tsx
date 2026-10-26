import { CsrfInput } from '@/components/layout/CsrfInput';
import { createClient } from '@/lib/supabase/server';
import { redirect } from 'next/navigation';
import Link from 'next/link';
import Image from 'next/image';
import type { Metadata } from 'next';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = { title: 'Buddy Reads' };

interface BuddyRead {
  id: string;
  book_id: string;
  max_participants: number;
  current_chapter: number;
  is_active: boolean;
  created_by: string;
  created_at: string;
}

export default async function BuddyReadsPage() {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect('/auth/login');

  // Get buddy reads user is part of
  const { data: participating } = await supabase
    .from('buddy_read_members')
    .select('buddy_read_id')
    .eq('user_id', user.id);

  const participatingIds = ((participating ?? []) as Array<{ buddy_read_id: string }>).map(
    (p) => p.buddy_read_id
  );

  let myReads: BuddyRead[] = [];
  if (participatingIds.length > 0) {
    const { data } = await supabase
      .from('buddy_reads')
      .select('id, book_id, max_participants, current_chapter, is_active, created_by, created_at')
      .in('id', participatingIds)
      .eq('is_active', true)
      .order('created_at', { ascending: false });
    myReads = data ?? [];
  }

  // Get open buddy reads user can join
  const { data: openReadsRaw } = await supabase
    .from('buddy_reads')
    .select('id, book_id, max_participants, current_chapter, is_active, created_by, created_at')
    .eq('is_active', true)
    .order('created_at', { ascending: false })
    .limit(20);

  const openReads: BuddyRead[] = ((openReadsRaw ?? []) as BuddyRead[]).filter(
    (r) => !participatingIds.includes(r.id)
  );

  // Get book details for all buddy reads
  const allBookIds = Array.from(
    new Set([...myReads, ...openReads].map((r) => r.book_id))
  );

  const bookMap: Record<string, { title: string; author_name: string; cover_url: string | null }> = {};
  if (allBookIds.length > 0) {
    const { data: books } = await supabase
      .from('books')
      .select('id, title, author_name, cover_url')
      .in('id', allBookIds);
    for (const b of books ?? []) {
      bookMap[b.id] = { title: b.title, author_name: b.author_name, cover_url: b.cover_url };
    }
  }

  function BuddyReadCard({
    read,
    showJoinButton,
  }: {
    read: BuddyRead;
    showJoinButton: boolean;
  }) {
    const book = bookMap[read.book_id];
    return (
      <div className="rounded-xl border border-neutral-200 dark:border-neutral-700 bg-white dark:bg-neutral-900 p-4">
        <div className="flex items-start gap-3">
          {book?.cover_url && (
            <div className="relative w-12 h-16 flex-shrink-0">
              <Image
                src={book.cover_url}
                alt={book.title ?? ''}
                fill
                className="object-cover rounded"
                sizes="48px"
              />
            </div>
          )}
          <div className="flex-1 min-w-0">
            {book ? (
              <>
                <Link
                  href={`/book/${read.book_id}`}
                  className="font-semibold text-sm hover:text-accent transition-colors"
                >
                  {book.title}
                </Link>
                <p className="text-xs text-neutral-500 dark:text-neutral-400">{book.author_name}</p>
              </>
            ) : (
              <p className="font-semibold text-sm text-neutral-500">Unknown book</p>
            )}
            <p className="text-xs text-neutral-500 dark:text-neutral-400 mt-1">
              Chapter {read.current_chapter} &bull; Up to {read.max_participants} participants
            </p>
          </div>
          <div className="flex flex-col gap-2 items-end">
            <Link
              href={`/buddy-reads/${read.id}`}
              className="px-3 py-1 rounded-lg text-xs font-medium bg-neutral-100 dark:bg-neutral-800 hover:bg-accent hover:text-white transition-colors"
            >
              View
            </Link>
            {showJoinButton && (
              <form action={`/api/buddy-reads/${read.id}/join`} method="POST"><CsrfInput />
                <button
                  type="submit"
                  className="px-3 py-1 rounded-lg text-xs font-medium bg-accent text-white hover:opacity-90 transition-opacity"
                >
                  Join
                </button>
              </form>
            )}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-2xl mx-auto px-4 py-8 space-y-8">
      <div className="flex items-center justify-between">
        <h1 className="font-display text-2xl font-bold">Buddy Reads</h1>
        <Link
          href="/buddy-reads/new"
          className="px-4 py-2 rounded-lg bg-accent text-white text-sm font-semibold hover:opacity-90"
        >
          + Start New
        </Link>
      </div>

      {myReads.length > 0 && (
        <section>
          <h2 className="font-display text-lg font-bold mb-3">My Buddy Reads</h2>
          <div className="space-y-3">
            {myReads.map((read) => (
              <BuddyReadCard key={read.id} read={read} showJoinButton={false} />
            ))}
          </div>
        </section>
      )}

      {openReads.length > 0 && (
        <section>
          <h2 className="font-display text-lg font-bold mb-3">Open Buddy Reads</h2>
          <div className="space-y-3">
            {openReads.map((read) => (
              <BuddyReadCard key={read.id} read={read} showJoinButton={true} />
            ))}
          </div>
        </section>
      )}

      {myReads.length === 0 && openReads.length === 0 && (
        <div className="text-center py-12">
          <p className="text-neutral-500 dark:text-neutral-400 mb-4">
            No buddy reads yet. Start one with friends!
          </p>
          <Link
            href="/buddy-reads/new"
            className="px-4 py-2 rounded-lg bg-accent text-white font-medium hover:opacity-90"
          >
            Start a Buddy Read
          </Link>
        </div>
      )}
    </div>
  );
}

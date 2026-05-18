import { createClient } from '@/lib/supabase/server';
import { MOOD_TAGS } from '@/constants/config';
import Link from 'next/link';
import Image from 'next/image';
import type { Metadata } from 'next';
import { notFound } from 'next/navigation';

export const dynamic = 'force-dynamic';

interface Props {
  params: { tag: string };
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const tag = decodeURIComponent(params.tag);
  const matched = MOOD_TAGS.find((t) => t.toLowerCase() === tag.toLowerCase());
  return { title: matched ? `${matched} Books` : 'Mood Books' };
}

export default async function MoodPage({ params }: Props) {
  const tagParam = decodeURIComponent(params.tag);
  const matchedTag = MOOD_TAGS.find((t) => t.toLowerCase() === tagParam.toLowerCase());

  if (!matchedTag) notFound();

  const supabase = createClient();

  // Find reviews that contain this mood tag
  const { data: reviews } = await supabase
    .from('reviews')
    .select('book_id')
    .contains('mood_tags', [matchedTag])
    .eq('moderation_status', 'published')
    .eq('is_hidden', false)
    .limit(500);

  const bookCounts: Record<string, number> = {};
  for (const r of reviews ?? []) {
    bookCounts[r.book_id] = (bookCounts[r.book_id] ?? 0) + 1;
  }

  const topBookIds = Object.entries(bookCounts)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 50)
    .map(([id]) => id);

  let books: Array<{
    id: string;
    title: string;
    author_name: string;
    cover_url: string | null;
  }> = [];

  if (topBookIds.length > 0) {
    const { data } = await supabase
      .from('books')
      .select('id, title, author_name, cover_url')
      .in('id', topBookIds);
    books = data ?? [];
    // Sort by review count
    books.sort((a, b) => (bookCounts[b.id] ?? 0) - (bookCounts[a.id] ?? 0));
  }

  return (
    <div className="max-w-2xl mx-auto px-4 py-6">
      <div className="mb-6">
        <Link href="/discover" className="text-sm text-neutral-500 hover:underline mb-2 inline-block">
          ← Back to Discover
        </Link>
        <h1 className="font-display text-2xl font-bold">{matchedTag} Books</h1>
        <p className="text-neutral-500 dark:text-neutral-400 text-sm mt-1">
          {books.length} books tagged as &quot;{matchedTag}&quot; by readers
        </p>
      </div>

      {books.length === 0 ? (
        <div className="text-center py-16">
          <p className="text-neutral-500">No books tagged as &quot;{matchedTag}&quot; yet.</p>
          <Link href="/discover" className="mt-4 inline-block text-accent hover:underline">
            Back to Discover
          </Link>
        </div>
      ) : (
        <div className="space-y-4">
          {books.map((book) => (
            <Link
              key={book.id}
              href={`/book/${book.id}`}
              className="flex gap-4 p-3 rounded-lg border border-neutral-200 dark:border-neutral-700 hover:bg-neutral-50 dark:hover:bg-neutral-800 transition-colors"
            >
              <div className="relative w-12 h-16 flex-shrink-0 rounded overflow-hidden bg-neutral-200 dark:bg-neutral-700">
                {book.cover_url ? (
                  <Image
                    src={book.cover_url}
                    alt={book.title}
                    fill
                    className="object-cover"
                    sizes="48px"
                  />
                ) : (
                  <div className="flex items-center justify-center h-full text-xl">📚</div>
                )}
              </div>
              <div className="flex-1 min-w-0">
                <p className="font-semibold leading-tight line-clamp-2">{book.title}</p>
                <p className="text-sm text-neutral-500 dark:text-neutral-400">{book.author_name}</p>
                <p className="text-xs text-accent mt-1">
                  {bookCounts[book.id]} review{bookCounts[book.id] !== 1 ? 's' : ''}
                </p>
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}

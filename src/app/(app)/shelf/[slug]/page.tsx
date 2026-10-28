import { createClient } from '@/lib/supabase/server';
import { notFound, redirect } from 'next/navigation';
import Image from 'next/image';
import Link from 'next/link';
import { ReadingProgressBar } from '@/components/shelf/ReadingProgressBar';
import { LogReadingSessionButton } from '@/components/shelf/LogReadingSessionButton';
import type { Metadata } from 'next';

export const dynamic = 'force-dynamic';

interface ShelfPageProps {
  params: { slug: string };
}

export async function generateMetadata({ params }: ShelfPageProps): Promise<Metadata> {
  const supabase = createClient();
  const { data: shelf } = await supabase
    .from('shelves')
    .select('name, description')
    .eq('slug', params.slug)
    .single();
  return { title: shelf ? shelf.name : 'Shelf' };
}

export default async function ShelfDetailPage({ params }: ShelfPageProps) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  const { data: shelf } = await supabase
    .from('shelves')
    .select('*')
    .eq('slug', params.slug)
    .eq('user_id', user.id)
    .single();

  if (!shelf) notFound();

  const { data: items } = await supabase
    .from('shelf_books')
    .select(`
      id, progress_pages, progress_percent, started_at, finished_at, added_at,
      books:book_id (id, title, author_name, cover_url, page_count, average_rating, isbn_13)
    `)
    .eq('shelf_id', shelf.id)
    .order('added_at', { ascending: false });

  // Build "Buy All on Amazon" URL for want_to_read shelves with ISBN-13s
  const booksWithIsbn = (items ?? [])
    .map((i) => (i.books as unknown as { isbn_13?: string | null } | null)?.isbn_13)
    .filter((isbn): isbn is string => !!isbn);
  const buyAllUrl =
    shelf.default_type === 'want_to_read' &&
    booksWithIsbn.length > 0 &&
    booksWithIsbn.length <= 10 &&
    booksWithIsbn.length === (items?.length ?? 0)
      ? `https://www.amazon.com/s?k=${booksWithIsbn.join('+')}&tag=liravo-20`
      : null;

  return (
    <div className="max-w-2xl mx-auto px-4 py-6">
      <div className="mb-6">
        <Link href="/shelf" className="text-sm text-muted-foreground hover:text-foreground mb-2 inline-block">
          ← My Shelf
        </Link>
        <h1 className="font-display text-2xl font-bold">{shelf.name}</h1>
        {shelf.description && <p className="text-muted-foreground text-sm mt-1">{shelf.description}</p>}
        <p className="text-xs text-muted-foreground mt-1">
          {items?.length ?? 0} books · {shelf.is_public ? 'Public' : 'Private'}
        </p>
        {buyAllUrl && (
          <a
            href={buyAllUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="mt-3 inline-flex items-center gap-2 rounded-lg bg-orange-500 hover:bg-orange-600 text-white text-sm font-medium px-4 py-2 transition-colors"
          >
            🛒 Buy All on Amazon
          </a>
        )}
      </div>

      {(!items || items.length === 0) ? (
        <div className="text-center py-16 text-muted-foreground">
          <p className="text-4xl mb-3">📚</p>
          <p>No books here yet.</p>
          <Link href="/discover" className="text-accent hover:underline text-sm mt-2 inline-block">
            Search for books to add
          </Link>
        </div>
      ) : (
        <div className="space-y-3">
          {items.map((item) => {
            const book = item.books as unknown as {
              id: string; title: string; author_name: string;
              cover_url: string | null; page_count: number | null; average_rating: number | null;
            } | null;

            if (!book) return null;

            return (
              <div key={item.id} className="flex gap-3 p-3 border border-border rounded-xl">
                <Link href={`/book/${book.id}`} className="flex-shrink-0">
                  <div className="w-12 h-16 relative">
                    {book.cover_url ? (
                      <Image src={book.cover_url} alt={book.title} fill sizes="48px" className="object-cover rounded" />
                    ) : (
                      <div className="w-full h-full bg-muted rounded flex items-center justify-center">
                        <span className="text-[8px] text-center text-muted-foreground px-0.5">{book.title.slice(0, 10)}</span>
                      </div>
                    )}
                  </div>
                </Link>

                <div className="flex-1 min-w-0">
                  <Link href={`/book/${book.id}`}>
                    <p className="font-medium text-sm truncate hover:underline">{book.title}</p>
                    <p className="text-xs text-muted-foreground">{book.author_name}</p>
                  </Link>

                  {shelf.default_type === 'currently_reading' && (
                    <ReadingProgressBar
                      shelfBookId={item.id}
                      bookId={book.id}
                      pageCount={book.page_count}
                      progressPages={item.progress_pages}
                      progressPercent={item.progress_percent}
                    />
                  )}

                  <div className="flex items-center gap-2 mt-1.5 flex-wrap">
                    <span className="text-xs text-muted-foreground">
                      Added {new Date(item.added_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                    </span>
                    {shelf.default_type === 'currently_reading' && (
                      <LogReadingSessionButton bookId={book.id} userId={user.id}/>
                    )}
                    {shelf.default_type === 'have_read' && (
                      <Link
                        href={`/share/finished/${user.id}/${book.id}`}
                        target="_blank"
                        className="text-xs text-muted-foreground hover:text-accent transition-colors"
                      >
                        Share card
                      </Link>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

import { languageAlternates } from '@/lib/metadata';
import { APP_URL } from '@/constants/config';
import { CsrfInput } from '@/components/layout/CsrfInput';
import { createClient } from '@/lib/supabase/server';
import Link from 'next/link';
import Image from 'next/image';
import { notFound } from 'next/navigation';
import type { Metadata } from 'next';

export const dynamic = 'force-dynamic';

interface Props {
  params: { id: string };
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const supabase = createClient();
  const { data } = await supabase 
    .from('reading_lists')
    .select('name, description, is_public')
    .eq('id', params.id)
    .single();
  if (!data?.is_public) return { title: 'Reading List', robots: { index: false, follow: false } };
  const url = `${APP_URL}/lists/${params.id}`;
  return {
    title: data.name, description: data.description ?? undefined,
    alternates: languageAlternates(`/lists/${params.id}`),
    openGraph: { title: data.name, description: data.description ?? '', url, type: 'website', images: [`${APP_URL}/opengraph-image`] },
    twitter: { card: 'summary', images: [`${APP_URL}/opengraph-image`], title: data.name, description: data.description ?? '' },
  };
}

export default async function ListDetailPage({ params }: Props) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();

  const { data: list } = await supabase 
    .from('reading_lists')
    .select('id, user_id, name, description, is_public, created_at')
    .eq('id', params.id)
    .single();

  if (!list) notFound();

  // Check visibility
  if (!list.is_public && list.user_id !== user?.id) {
    return (
      <div className="max-w-2xl mx-auto px-4 py-16 text-center">
        <p className="text-neutral-500">This list is private.</p>
        <Link href="/lists" className="text-accent hover:underline mt-2 inline-block">
          Browse public lists
        </Link>
      </div>
    );
  }

  // Get books
  const { data: listBooks } = await supabase 
    .from('reading_list_books')
    .select('book_id, added_at')
    .eq('list_id', params.id)
    .order('added_at', { ascending: false });

  const bookIds = ((listBooks ?? []) as { book_id: string }[]).map((b) => b.book_id);
  let books: Array<{ id: string; title: string; author_name: string; cover_url: string | null; isbn_13: string | null }> = [];
  if (bookIds.length > 0) {
    const { data } = await supabase
      .from('books')
      .select('id, title, author_name, cover_url, isbn_13')
      .in('id', bookIds);
    books = data ?? [];
    books.sort((a, b) => bookIds.indexOf(a.id) - bookIds.indexOf(b.id));
  }

  // Build "Buy all on Amazon" URL if all books have ISBNs
  const booksWithIsbn = books.filter((b) => b.isbn_13);
  const buyAllAmazonUrl = booksWithIsbn.length === books.length && books.length > 0 && books.length <= 10
    ? `https://www.amazon.com/s?k=${booksWithIsbn.map((b) => b.isbn_13).join('+')}&tag=liravo-20`
    : null;

  // Is the current user the owner?
  const isOwner = user?.id === list.user_id;

  // Is the current user following this list?
  let isFollowing = false;
  if (user && !isOwner) {
    const { data: followData } = await supabase 
      .from('reading_list_follows')
      .select('list_id')
      .eq('list_id', params.id)
      .eq('user_id', user.id)
      .maybeSingle();
    isFollowing = !!followData;
  }

  return (
    <div className="max-w-2xl mx-auto px-4 py-6 space-y-6">
      <Link href="/lists" className="text-sm text-neutral-500 hover:underline">
        ← Back to Lists
      </Link>

      <div className="flex items-start justify-between gap-4">
        <div className="flex-1 min-w-0">
          <h1 className="font-display text-2xl font-bold">{list.name}</h1>
          {list.description && (
            <p className="text-neutral-600 dark:text-neutral-400 mt-1">{list.description}</p>
          )}
          <p className="text-sm text-neutral-500 mt-1">{books.length} book{books.length !== 1 ? 's' : ''}</p>
        </div>

        {user && !isOwner && (
          <div className="flex gap-2 flex-shrink-0">
            <form action={`/api/lists/${params.id}/fork`} method="POST"><CsrfInput />
              <button
                type="submit"
                className="px-3 py-2 border border-neutral-300 dark:border-neutral-600 rounded-lg text-sm hover:bg-neutral-50 dark:hover:bg-neutral-800 transition-colors"
              >
                Fork
              </button>
            </form>
            <form action={isFollowing ? `/api/lists/${params.id}/follow` : `/api/lists/${params.id}/follow`} method={isFollowing ? 'DELETE' : 'POST'}>
              <button
                type="submit"
                className={`px-3 py-2 rounded-lg text-sm font-medium transition-colors ${isFollowing ? 'bg-neutral-100 dark:bg-neutral-800 text-neutral-700 dark:text-neutral-300' : 'bg-accent text-white'}`}
              >
                {isFollowing ? 'Unfollow' : 'Follow'}
              </button>
            </form>
          </div>
        )}
      </div>

      {/* Buy All on Amazon CTA */}
      {buyAllAmazonUrl && (
        <a
          href={buyAllAmazonUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="flex items-center justify-center gap-2 w-full py-3 px-4 rounded-xl bg-[#FF9900] text-black font-semibold text-sm hover:opacity-90 transition-opacity mb-4"
          onClick={async () => {
            await fetch('/api/books/click', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ linkType: 'amazon_bulk_list', storeName: 'Amazon', isAffiliate: true }) });
          }}
        >
          🛒 Buy All on Amazon
        </a>
      )}

      {/* Books */}
      {books.length === 0 ? (
        <div className="text-center py-12 text-neutral-500">
          <p>No books in this list yet.</p>
          {isOwner && (
            <p className="text-sm mt-1">Search for books and add them to this list.</p>
          )}
        </div>
      ) : (
        <div className="space-y-3">
          {books.map((book) => (
            <Link
              key={book.id}
              href={`/book/${book.id}`}
              className="flex gap-4 p-3 border border-neutral-200 dark:border-neutral-700 rounded-lg hover:bg-neutral-50 dark:hover:bg-neutral-800 transition-colors"
            >
              <div className="relative w-10 h-14 flex-shrink-0 rounded overflow-hidden bg-neutral-200 dark:bg-neutral-700">
                {book.cover_url ? (
                  <Image
                    src={book.cover_url}
                    alt={book.title}
                    fill
                    className="object-cover"
                    sizes="40px"
                  />
                ) : (
                  <div className="flex items-center justify-center h-full text-lg">📚</div>
                )}
              </div>
              <div className="flex-1 min-w-0">
                <p className="font-semibold leading-tight line-clamp-2">{book.title}</p>
                <p className="text-sm text-neutral-500 dark:text-neutral-400">{book.author_name}</p>
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}

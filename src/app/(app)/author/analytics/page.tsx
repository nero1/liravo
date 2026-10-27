import { bookRating } from '@/lib/catalog-book';
import { singleRelation } from '@/lib/utils';
import { redirect } from 'next/navigation';
import { createClient, createServiceClient } from '@/lib/supabase/server';
import Link from 'next/link';
import Image from 'next/image';
import type { Metadata } from 'next';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = { title: 'Author Analytics — Liravo' };

export default async function AuthorAnalyticsPage() {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  const { data: profile } = await supabase
    .from('users')
    .select('is_verified_author, display_name')
    .eq('id', user.id)
    .single();

  if (!profile?.is_verified_author) redirect('/settings/verify-author');

  const serviceSupabase = createServiceClient();
  const authorName = profile.display_name;

  const { data: rawBooks } = await serviceSupabase
    .from('books')
    .select('id, title, cover_url, average_rating, ratings_count, currently_reading_count, want_to_read_count, have_read_count')
    .ilike('author_name', authorName)
    .order('have_read_count', { ascending: false })
    .limit(50);

  const books=(rawBooks??[]).map(book=>({...book,average_rating:bookRating(book.average_rating)}));
  const bookIds = (books ?? []).map((b) => b.id);

  const totalWantToReads = (books ?? []).reduce((s, b) => s + (b.want_to_read_count ?? 0), 0);
  const totalCurrentlyReading = (books ?? []).reduce((s, b) => s + (b.currently_reading_count ?? 0), 0);
  const totalHaveRead = (books ?? []).reduce((s, b) => s + (b.have_read_count ?? 0), 0);

  let totalReviews = 0;
  let recentReviews: Array<{
    id: string; rating: number; content: string | null; created_at: string;
    books: { title: string } | null;
    users: { display_name: string; username: string } | null;
  }> = [];

  if (bookIds.length > 0) {
    const { count } = await serviceSupabase
      .from('reviews').select('*', { count: 'exact', head: true })
      .in('book_id', bookIds).eq('moderation_status', 'published');
    totalReviews = count ?? 0;

    const { data: rv } = await serviceSupabase
      .from('reviews')
      .select('id, rating, content, created_at, books:book_id(title), users:user_id(display_name, username)')
      .in('book_id', bookIds).eq('moderation_status', 'published')
      .order('created_at', { ascending: false }).limit(5);
    recentReviews = (rv ?? []).map(row => ({ ...row, books: singleRelation(row.books), users: singleRelation(row.users) }));
  }

  const { count: followerCount } = await serviceSupabase
    .from('follows').select('*', { count: 'exact', head: true }).eq('following_id', user.id);

  return (
    <div className="max-w-3xl mx-auto px-4 py-6">
      <div className="flex items-center justify-between mb-6">
        <h1 className="font-display text-2xl font-bold">Author Analytics</h1>
        <Link href="/author/posts/new" className="text-sm text-accent hover:underline">
          + New Post
        </Link>
      </div>

      {/* Overview stats */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-8">
        {[
          { label: 'Books', value: (books ?? []).length },
          { label: 'Want to Read', value: totalWantToReads },
          { label: 'Currently Reading', value: totalCurrentlyReading },
          { label: 'Have Read', value: totalHaveRead },
          { label: 'Total Reviews', value: totalReviews },
          { label: 'Followers', value: followerCount ?? 0 },
        ].map((s) => (
          <div key={s.label} className="rounded-xl border border-border bg-card p-4">
            <p className="text-xs text-muted-foreground mb-1">{s.label}</p>
            <p className="text-2xl font-bold">{s.value.toLocaleString()}</p>
          </div>
        ))}
      </div>

      {/* Books table */}
      {(books ?? []).length > 0 && (
        <section className="mb-8">
          <h2 className="font-semibold text-lg mb-3">Your Books</h2>
          <div className="space-y-3">
            {(books ?? []).map((book) => (
              <Link
                key={book.id}
                href={`/book/${book.id}`}
                className="flex gap-3 items-center p-3 rounded-xl border border-border hover:bg-muted transition-colors"
              >
                <div className="relative w-10 h-14 flex-shrink-0 rounded overflow-hidden bg-muted">
                  {book.cover_url && (
                    <Image src={book.cover_url} alt={book.title} fill className="object-cover" sizes="40px" />
                  )}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="font-semibold text-sm line-clamp-1">{book.title}</p>
                  <div className="flex gap-3 text-xs text-muted-foreground mt-0.5">
                    <span>★ {book.average_rating?.toFixed(1) ?? '—'}</span>
                    <span>{book.want_to_read_count ?? 0} want to read</span>
                    <span>{book.have_read_count ?? 0} read</span>
                  </div>
                </div>
              </Link>
            ))}
          </div>
        </section>
      )}

      {/* Recent reviews */}
      {recentReviews.length > 0 && (
        <section>
          <h2 className="font-semibold text-lg mb-3">Recent Reviews</h2>
          <div className="space-y-3">
            {recentReviews.map((review) => {
              const reviewer = review.users;
              const bookTitle = review.books?.title ?? 'Unknown Book';
              return (
                <div key={review.id} className="p-4 rounded-xl border border-border">
                  <div className="flex items-center justify-between mb-1">
                    <p className="font-medium text-sm">{bookTitle}</p>
                    <span className="text-amber-500 text-sm">{'★'.repeat(review.rating)}</span>
                  </div>
                  {review.content && (
                    <p className="text-sm text-muted-foreground line-clamp-2">{review.content}</p>
                  )}
                  {reviewer && (
                    <Link href={`/user/${reviewer.username}`} className="text-xs text-muted-foreground/60 hover:underline mt-1 inline-block">
                      — {reviewer.display_name}
                    </Link>
                  )}
                </div>
              );
            })}
          </div>
        </section>
      )}
    </div>
  );
}

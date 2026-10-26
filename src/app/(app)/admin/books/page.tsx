import { CsrfInput } from '@/components/layout/CsrfInput';
import { createClient } from '@/lib/supabase/server';
import { redirect } from 'next/navigation';
import type { Metadata } from 'next';
import { AudiobookToggle } from './AudiobookToggle';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = { title: 'Book Management — Admin' };

export default async function AdminBooksPage() {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  const { data: profile } = await supabase
    .from('users')
    .select('is_admin')
    .eq('id', user.id)
    .single();
  if (!profile?.is_admin) redirect('/');

  const { data: books } = await supabase
    .from('books')
    .select('id, title, author_name, cover_url, google_books_id, have_read_count, has_audiobook')
    .order('have_read_count', { ascending: false })
    .limit(100);

  // Count affiliate links per book
  const bookIds = (books ?? []).map((b) => b.id);
  const affiliateCounts: Record<string, number> = {};

  if (bookIds.length > 0) {
    const { data: clicks } = await supabase
      .from('affiliate_link_clicks')
      .select('book_id')
      .in('book_id', bookIds)
      .eq('is_affiliate', true);

    for (const click of clicks ?? []) {
      affiliateCounts[click.book_id] = (affiliateCounts[click.book_id] ?? 0) + 1;
    }
  }

  return (
    <div className="max-w-5xl mx-auto px-4 py-6">
      <h1 className="font-display text-2xl font-bold mb-6">Book Management</h1>
      <p className="text-sm text-muted-foreground mb-4">
        Top 100 books by have-read count. Click &quot;Refresh Links&quot; to trigger affiliate link regeneration.
      </p>

      <div className="rounded-xl border border-border overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-muted">
            <tr>
              <th className="text-left px-4 py-3 font-semibold text-muted-foreground">Book</th>
              <th className="text-left px-4 py-3 font-semibold text-muted-foreground">Author</th>
              <th className="text-left px-4 py-3 font-semibold text-muted-foreground">Source</th>
              <th className="text-center px-4 py-3 font-semibold text-muted-foreground">Affiliate Clicks</th>
              <th className="text-center px-4 py-3 font-semibold text-muted-foreground">Audiobook</th>
              <th className="text-left px-4 py-3 font-semibold text-muted-foreground">Actions</th>
            </tr>
          </thead>
          <tbody>
            {(books ?? []).map((book) => (
              <tr key={book.id} className="border-t border-border hover:bg-muted/50">
                <td className="px-4 py-3">
                  <div className="flex items-center gap-3">
                    {book.cover_url && (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={book.cover_url}
                        alt={book.title}
                        className="w-8 h-12 object-cover rounded"
                      />
                    )}
                    <span className="font-medium line-clamp-1">{book.title}</span>
                  </div>
                </td>
                <td className="px-4 py-3 text-muted-foreground">{book.author_name}</td>
                <td className="px-4 py-3 text-xs text-muted-foreground">
                  {book.google_books_id ? `GB: ${book.google_books_id.slice(0, 8)}...` : 'Manual'}
                </td>
                <td className="px-4 py-3 text-center">
                  {affiliateCounts[book.id] ?? 0}
                </td>
                <td className="px-4 py-3 text-center">
                  <AudiobookToggle bookId={book.id} initial={book.has_audiobook ?? false} />
                </td>
                <td className="px-4 py-3">
                  <form action="/api/books/refresh-affiliate" method="POST"><CsrfInput />
                    <input type="hidden" name="bookId" value={book.id} />
                    <button
                      type="submit"
                      className="px-2 py-1 text-xs border border-border rounded hover:bg-muted transition-colors"
                    >
                      Refresh Links
                    </button>
                  </form>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

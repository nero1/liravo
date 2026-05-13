import { createClient } from '@/lib/supabase/server';
import { redirect } from 'next/navigation';
import Link from 'next/link';
import type { Metadata } from 'next';

export const metadata: Metadata = { title: 'My Quotes' };

export default async function QuotesPage() {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  const { data: quotes } = await supabase
    .from('quotes')
    .select('id, content, page_number, created_at, books:book_id(id, title, author_name)')
    .eq('user_id', user.id)
    .order('created_at', { ascending: false });

  return (
    <div className="max-w-2xl mx-auto px-4 py-6">
      <div className="flex items-center justify-between mb-6">
        <h1 className="font-display text-2xl font-bold">My Quotes</h1>
        <span className="text-sm text-muted-foreground">{quotes?.length ?? 0} quotes</span>
      </div>

      {(!quotes || quotes.length === 0) ? (
        <div className="text-center py-16 text-muted-foreground">
          <p className="text-4xl mb-3">💬</p>
          <p className="font-medium mb-1">No quotes yet</p>
          <p className="text-sm mb-4">Save memorable passages from books you read</p>
          <Link href="/discover" className="text-accent hover:underline text-sm">
            Find a book to read
          </Link>
        </div>
      ) : (
        <div className="space-y-4">
          {(quotes as unknown as Array<{
            id: string;
            content: string;
            page_number: number | null;
            created_at: string;
            books: { id: string; title: string; author_name: string } | null;
          }>).map((quote) => (
            <div key={quote.id} className="p-4 border border-border rounded-xl">
              <blockquote className="text-sm italic mb-3 leading-relaxed">
                &ldquo;{quote.content}&rdquo;
              </blockquote>
              <div className="flex items-center justify-between">
                <div>
                  {quote.books && (
                    <Link href={`/book/${quote.books.id}`} className="text-xs font-medium hover:underline">
                      {quote.books.title}
                    </Link>
                  )}
                  {quote.page_number && (
                    <span className="text-xs text-muted-foreground ml-2">p. {quote.page_number}</span>
                  )}
                </div>
                <span className="text-xs text-muted-foreground">
                  {new Date(quote.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                </span>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

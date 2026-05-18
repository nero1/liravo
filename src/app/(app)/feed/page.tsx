import { createClient } from '@/lib/supabase/server';
import { redirect } from 'next/navigation';
import Image from 'next/image';
import Link from 'next/link';
import { BookOpen, Star, Rss } from 'lucide-react';

export const dynamic = 'force-dynamic';

export const metadata = {
  title: 'Feed — Liravo',
};

interface ShelfFeedItem {
  type: 'shelf_book';
  id: string;
  timestamp: string;
  user: { display_name: string; avatar_url: string | null; username: string } | null;
  book: { id: string; title: string; author_name: string; cover_url: string | null } | null;
  shelf: { name: string; default_type: string | null } | null;
  finishedAt: string | null;
}

interface ReviewFeedItem {
  type: 'review';
  id: string;
  timestamp: string;
  user: { display_name: string; avatar_url: string | null; username: string } | null;
  book: { id: string; title: string; author_name: string; cover_url: string | null } | null;
  rating: number;
  reviewType: string;
  excerpt: string | null;
}

type FeedItem = ShelfFeedItem | ReviewFeedItem;

function timeAgo(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  const minutes = Math.floor(diff / 60000);
  if (minutes < 1) return 'Just now';
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}d ago`;
  return new Date(dateStr).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

function getShelfAction(item: ShelfFeedItem): string {
  if (item.finishedAt) return 'finished reading';
  const type = item.shelf?.default_type;
  if (type === 'currently_reading') return 'started reading';
  if (type === 'want_to_read') return 'wants to read';
  return `added to ${item.shelf?.name ?? 'shelf'}`;
}

export default async function FeedPage({
  searchParams,
}: {
  searchParams: { cursor?: string };
}) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  const cursor = searchParams.cursor;
  const params = new URLSearchParams();
  if (cursor) params.set('cursor', cursor);

  const baseUrl = process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3000';
  let items: FeedItem[] = [];
  let nextCursor: string | null = null;

  try {
    const res = await fetch(`${baseUrl}/api/feed${params.toString() ? `?${params}` : ''}`, {
      headers: { Cookie: '' },
      cache: 'no-store',
    });

    if (res.ok) {
      const data = await res.json() as { items: FeedItem[]; nextCursor: string | null };
      items = data.items;
      nextCursor = data.nextCursor;
    }
  } catch {
    // Fallback: fetch directly from DB
    const { data: follows } = await supabase
      .from('follows')
      .select('following_id')
      .eq('follower_id', user.id);

    const followedIds = (follows ?? []).map((f) => f.following_id);

    if (followedIds.length > 0) {
      const { data: shelfBooks } = await supabase
        .from('shelf_books')
        .select(`
          id, added_at, finished_at, user_id,
          books:book_id (id, title, author_name, cover_url),
          users:user_id (display_name, avatar_url, username),
          shelves:shelf_id (name, default_type)
        `)
        .in('user_id', followedIds)
        .order('added_at', { ascending: false })
        .limit(20);

      items = (shelfBooks ?? []).map((sb) => ({
        type: 'shelf_book' as const,
        id: `sb-${sb.id}`,
        timestamp: sb.added_at,
        user: sb.users as unknown as ShelfFeedItem['user'],
        book: sb.books as unknown as ShelfFeedItem['book'],
        shelf: sb.shelves as unknown as ShelfFeedItem['shelf'],
        finishedAt: sb.finished_at,
      }));
    }
  }

  return (
    <div className="max-w-2xl mx-auto">
      <div className="sticky top-0 z-10 bg-background/80 backdrop-blur-sm border-b border-border px-4 py-4">
        <div className="flex items-center gap-2">
          <Rss className="w-5 h-5 text-amber-500" />
          <h1 className="text-xl font-display font-bold">Feed</h1>
        </div>
      </div>

      <div className="divide-y divide-border">
        {items.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 px-4 text-center">
            <Rss className="w-12 h-12 text-muted-foreground/30 mb-4" />
            <h2 className="text-lg font-semibold mb-2">Nothing here yet</h2>
            <p className="text-muted-foreground text-sm max-w-xs">
              Follow other readers to see their reading activity and reviews in your feed.
            </p>
            <Link
              href="/discover"
              className="mt-4 px-4 py-2 bg-amber-500 text-white rounded-lg text-sm font-medium hover:bg-amber-600 transition-colors"
            >
              Discover readers
            </Link>
          </div>
        ) : (
          items.map((item) => (
            <article key={item.id} className="flex gap-3 px-4 py-4">
              {/* User avatar */}
              <div className="shrink-0">
                {item.user?.avatar_url ? (
                  <Image
                    src={item.user.avatar_url}
                    alt={item.user.display_name}
                    width={36}
                    height={36}
                    className="w-9 h-9 rounded-full object-cover"
                  />
                ) : (
                  <div className="w-9 h-9 rounded-full bg-amber-100 dark:bg-amber-900/30 flex items-center justify-center">
                    <span className="text-sm font-bold text-amber-600">
                      {item.user?.display_name?.[0]?.toUpperCase() ?? '?'}
                    </span>
                  </div>
                )}
              </div>

              <div className="flex-1 min-w-0">
                <p className="text-sm">
                  <Link
                    href={`/@${item.user?.username}`}
                    className="font-semibold hover:text-amber-600 transition-colors"
                  >
                    {item.user?.display_name ?? 'Unknown'}
                  </Link>
                  {' '}
                  <span className="text-muted-foreground">
                    {item.type === 'shelf_book'
                      ? getShelfAction(item)
                      : `wrote a ${item.reviewType} review`}
                  </span>
                </p>

                {item.book && (
                  <div className="mt-2 flex gap-3">
                    {item.book.cover_url ? (
                      <Image
                        src={item.book.cover_url}
                        alt={item.book.title}
                        width={48}
                        height={72}
                        className="w-12 rounded shadow-sm object-cover shrink-0"
                      />
                    ) : (
                      <div className="w-12 h-[72px] bg-muted rounded flex items-center justify-center shrink-0">
                        <BookOpen className="w-5 h-5 text-muted-foreground/40" />
                      </div>
                    )}
                    <div>
                      <Link
                        href={`/book/${item.book.id}`}
                        className="font-medium text-sm hover:text-amber-600 transition-colors line-clamp-2"
                      >
                        {item.book.title}
                      </Link>
                      <p className="text-xs text-muted-foreground mt-0.5">{item.book.author_name}</p>

                      {item.type === 'review' && (
                        <>
                          <div className="flex gap-0.5 mt-1">
                            {[1, 2, 3, 4, 5].map((s) => (
                              <Star
                                key={s}
                                size={12}
                                className={
                                  s <= item.rating
                                    ? 'fill-amber-400 stroke-amber-400'
                                    : 'stroke-muted-foreground/40'
                                }
                              />
                            ))}
                          </div>
                          {item.excerpt && (
                            <p className="text-xs text-muted-foreground mt-1 line-clamp-2">
                              {item.excerpt}
                            </p>
                          )}
                        </>
                      )}
                    </div>
                  </div>
                )}

                <p className="text-xs text-muted-foreground/60 mt-2">
                  {timeAgo(item.timestamp)}
                </p>
              </div>
            </article>
          ))
        )}
      </div>

      {nextCursor && (
        <div className="px-4 py-6 text-center">
          <Link
            href={`/feed?cursor=${encodeURIComponent(nextCursor)}`}
            className="px-4 py-2 border border-border rounded-lg text-sm font-medium hover:bg-muted transition-colors"
          >
            Load more
          </Link>
        </div>
      )}
    </div>
  );
}

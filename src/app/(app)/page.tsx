import { createClient } from '@/lib/supabase/server';
import { redirect } from 'next/navigation';
import Link from 'next/link';
import Image from 'next/image';

export const dynamic = 'force-dynamic';

export default async function HomePage() {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) redirect('/login');

  const { data: profile } = await supabase
    .from('users')
    .select('onboarding_complete, display_name, xp, reading_streak, books_read_count')
    .eq('id', user.id)
    .single();

  if (!profile?.onboarding_complete) redirect('/onboarding');

  // Fetch recent feed items from followed users
  const { data: follows } = await supabase
    .from('follows')
    .select('following_id')
    .eq('follower_id', user.id)
    .limit(50);

  const followedIds = (follows ?? []).map((f) => f.following_id);

  const [{ data: recentActivity }, { data: trending }] = await Promise.all([
    followedIds.length > 0
      ? supabase
          .from('shelf_books')
          .select('id, added_at, books:book_id(id, title, author_name, cover_url), users:user_id(display_name, username)')
          .in('user_id', followedIds)
          .order('added_at', { ascending: false })
          .limit(10)
      : { data: [] },
    supabase
      .from('shelf_books')
      .select('book_id, books:book_id(id, title, author_name, cover_url)')
      .gte('added_at', new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString())
      .limit(100),
  ]);

  // Count trending by book_id
  const trendingMap: Record<string, { count: number; book: { id: string; title: string; author_name: string; cover_url: string | null } }> = {};
  for (const row of trending ?? []) {
    const book = (row.books as unknown) as { id: string; title: string; author_name: string; cover_url: string | null } | null;
    if (!book) continue;
    if (!trendingMap[book.id]) trendingMap[book.id] = { count: 0, book };
    trendingMap[book.id].count++;
  }
  const trendingBooks = Object.values(trendingMap)
    .sort((a, b) => b.count - a.count)
    .slice(0, 6);

  return (
    <div className="max-w-2xl mx-auto px-4 py-6 space-y-8">
      {/* Greeting + stats */}
      <div>
        <h1 className="font-display text-2xl font-bold">
          Welcome back, {profile.display_name}
        </h1>
        <div className="flex items-center gap-4 mt-2 text-sm text-muted-foreground">
          <span>📚 {profile.books_read_count ?? 0} books read</span>
          <span>🔥 {profile.reading_streak ?? 0} day streak</span>
          <span>⭐ {profile.xp ?? 0} XP</span>
        </div>
      </div>

      {/* Activity feed from followed users */}
      {(recentActivity ?? []).length > 0 && (
        <section>
          <h2 className="font-semibold text-sm text-muted-foreground uppercase tracking-wide mb-3">
            Friends&apos; Activity
          </h2>
          <div className="space-y-3">
            {(recentActivity as Array<{
              id: string;
              added_at: string;
              books: { id: string; title: string; author_name: string; cover_url: string | null } | null;
              users: { display_name: string; username: string } | null;
            }>).map((item) => {
              if (!item.books || !item.users) return null;
              return (
                <div key={item.id} className="flex items-center gap-3 p-3 border border-border rounded-xl">
                  <div className="w-10 h-14 relative flex-shrink-0">
                    {item.books.cover_url ? (
                      <Image src={item.books.cover_url} alt={item.books.title} fill sizes="40px" className="object-cover rounded" />
                    ) : (
                      <div className="w-full h-full bg-muted rounded" />
                    )}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm">
                      <Link href={`/@${item.users.username}`} className="font-medium hover:underline">
                        {item.users.display_name}
                      </Link>
                      {' '}added{' '}
                      <Link href={`/book/${item.books.id}`} className="font-medium hover:underline">
                        {item.books.title}
                      </Link>
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {new Date(item.added_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                    </p>
                  </div>
                </div>
              );
            })}
          </div>
          <Link href="/feed" className="block text-sm text-accent hover:underline mt-3 text-center">
            See full feed →
          </Link>
        </section>
      )}

      {/* Empty state for new users */}
      {followedIds.length === 0 && (
        <div className="text-center py-10 border border-dashed border-border rounded-xl">
          <p className="text-4xl mb-3">👋</p>
          <p className="font-medium mb-1">Your feed is empty</p>
          <p className="text-sm text-muted-foreground mb-4">Follow readers to see their activity here</p>
          <Link href="/discover" className="px-4 py-2 bg-accent text-accent-foreground rounded-lg text-sm font-medium hover:bg-accent/90">
            Discover Books
          </Link>
        </div>
      )}

      {/* Trending this week */}
      {trendingBooks.length > 0 && (
        <section>
          <h2 className="font-semibold text-sm text-muted-foreground uppercase tracking-wide mb-3">
            Trending This Week
          </h2>
          <div className="grid grid-cols-3 gap-3">
            {trendingBooks.map(({ book, count }) => (
              <Link key={book.id} href={`/book/${book.id}`} className="group">
                <div className="aspect-[2/3] relative bg-muted rounded-lg overflow-hidden mb-1.5">
                  {book.cover_url ? (
                    <Image src={book.cover_url} alt={book.title} fill sizes="120px" className="object-cover group-hover:scale-105 transition-transform" />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center p-2">
                      <span className="text-[9px] text-center text-muted-foreground">{book.title.slice(0, 20)}</span>
                    </div>
                  )}
                </div>
                <p className="text-xs font-medium truncate">{book.title}</p>
                <p className="text-[10px] text-muted-foreground">{count} shelved</p>
              </Link>
            ))}
          </div>
        </section>
      )}

      {/* Quick actions */}
      <section className="grid grid-cols-2 gap-3">
        <Link href="/shelf" className="p-4 border border-border rounded-xl hover:bg-muted transition-colors">
          <p className="text-xl mb-1">📚</p>
          <p className="font-medium text-sm">My Shelf</p>
          <p className="text-xs text-muted-foreground">Track your reading</p>
        </Link>
        <Link href="/challenges" className="p-4 border border-border rounded-xl hover:bg-muted transition-colors">
          <p className="text-xl mb-1">🏆</p>
          <p className="font-medium text-sm">Challenges</p>
          <p className="text-xs text-muted-foreground">Join a reading challenge</p>
        </Link>
      </section>
    </div>
  );
}

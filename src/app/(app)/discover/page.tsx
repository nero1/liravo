import { createClient } from '@/lib/supabase/server';
import { BookSearch } from '@/components/books/BookSearch';
import { MOOD_TAGS } from '@/constants/config';
import { getRedisClient } from '@/lib/redis';
import Link from 'next/link';
import Image from 'next/image';
import type { Metadata } from 'next';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = { title: 'Discover' };

interface CreatorEntry {
  user_id: string;
  username: string;
  display_name: string;
  avatar_url: string | null;
  want_to_read_score: number;
  is_verified_author: boolean;
}

async function getTopCreators(): Promise<CreatorEntry[]> {
  try {
    const APP_URL = process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3000';
    const res = await fetch(`${APP_URL}/api/creator/leaderboard`, { cache: 'no-store' });
    if (!res.ok) return [];
    const data = await res.json() as { leaderboard?: CreatorEntry[] };
    return (data.leaderboard ?? []).slice(0, 5);
  } catch {
    return [];
  }
}

interface PromotedBook {
  id: string;
  title: string;
  author_name: string;
  cover_url: string | null;
}

async function getPromotedBooks(): Promise<PromotedBook[]> {
  const supabase = createClient();
  const now = new Date().toISOString();

  const { data: listings } = await supabase
    .from('promoted_listings')
    .select('book_id')
    .eq('placement', 'discover_top')
    .eq('is_active', true)
    .lte('start_date', now)
    .gte('end_date', now)
    .limit(5);

  if (!listings || listings.length === 0) return [];

  const bookIds = (listings as Array<{ book_id: string }>).map((l) => l.book_id);
  const { data: books } = await supabase
    .from('books')
    .select('id, title, author_name, cover_url')
    .in('id', bookIds);

  return books ?? [];
}

interface TrendingBook {
  book_id: string;
  count: number;
  book: {
    id: string;
    title: string;
    author_name: string;
    cover_url: string | null;
  } | null;
}

async function getTrendingBooks(countryFilter?: string | null) {
  const supabase = createClient();
  const since = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();

  if (countryFilter) {
    // Get shelf_books added in last 7 days joined with users filtered by country
    const { data } = await supabase
      .from('shelf_books')
      .select('book_id, user_id, added_at')
      .gte('added_at', since)
      .limit(500);

    if (!data || data.length === 0) return [];

    // Get users in the country
    const userIds = Array.from(new Set(data.map((r) => r.user_id)));
    const { data: countryUsers } = await supabase
      .from('users')
      .select('id')
      .in('id', userIds)
      .eq('country', countryFilter);

    const countryUserSet = new Set((countryUsers ?? []).map((u) => u.id));
    const filtered = data.filter((r) => countryUserSet.has(r.user_id));

    const counts: Record<string, number> = {};
    for (const r of filtered) {
      counts[r.book_id] = (counts[r.book_id] ?? 0) + 1;
    }

    const topBookIds = Object.entries(counts)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 10)
      .map(([id]) => id);

    if (topBookIds.length === 0) return [];

    const { data: books } = await supabase
      .from('books')
      .select('id, title, author_name, cover_url')
      .in('id', topBookIds);

    return topBookIds.map((id) => ({
      book_id: id,
      count: counts[id],
      book: books?.find((b) => b.id === id) ?? null,
    }));
  } else {
    const { data } = await supabase
      .from('shelf_books')
      .select('book_id, added_at')
      .gte('added_at', since)
      .limit(1000);

    if (!data || data.length === 0) return [];

    const counts: Record<string, number> = {};
    for (const r of data) {
      counts[r.book_id] = (counts[r.book_id] ?? 0) + 1;
    }

    const topBookIds = Object.entries(counts)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 10)
      .map(([id]) => id);

    if (topBookIds.length === 0) return [];

    const { data: books } = await supabase
      .from('books')
      .select('id, title, author_name, cover_url')
      .in('id', topBookIds);

    return topBookIds.map((id) => ({
      book_id: id,
      count: counts[id],
      book: books?.find((b) => b.id === id) ?? null,
    }));
  }
}

interface HiddenGem {
  id: string;
  title: string;
  author_name: string;
  cover_url: string | null;
  average_rating: number | null;
  have_read_count: number;
}

async function getHiddenGems(): Promise<HiddenGem[]> {
  const supabase = createClient();
  const { data } = await supabase
    .from('books')
    .select('id, title, author_name, cover_url, average_rating, have_read_count')
    .gte('average_rating', 4.0)
    .lt('have_read_count', 50)
    .order('average_rating', { ascending: false })
    .limit(10);
  return data ?? [];
}

async function getRecommendedBooks(userId: string) {
  const supabase = createClient();

  // Get users this person follows
  const { data: follows } = await supabase
    .from('follows')
    .select('following_id')
    .eq('follower_id', userId);

  if (!follows || follows.length === 0) return [];

  const followedIds = follows.map((f) => f.following_id);

  // Get books this user has read
  const { data: myBooks } = await supabase
    .from('shelf_books')
    .select('book_id')
    .eq('user_id', userId);

  const myBookIds = new Set((myBooks ?? []).map((b) => b.book_id));

  // Get books from followed users' shelves that this user hasn't read
  const { data: friendBooks } = await supabase
    .from('shelf_books')
    .select('book_id')
    .in('user_id', followedIds)
    .limit(500);

  if (!friendBooks || friendBooks.length === 0) return [];

  const counts: Record<string, number> = {};
  for (const r of friendBooks) {
    if (!myBookIds.has(r.book_id)) {
      counts[r.book_id] = (counts[r.book_id] ?? 0) + 1;
    }
  }

  const topBookIds = Object.entries(counts)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 10)
    .map(([id]) => id);

  if (topBookIds.length === 0) return [];

  const { data: books } = await supabase
    .from('books')
    .select('id, title, author_name, cover_url')
    .in('id', topBookIds);

  return topBookIds.map((id) => ({
    book_id: id,
    count: counts[id],
    book: books?.find((b) => b.id === id) ?? null,
  }));
}

interface FollowedAuthorBook {
  id: string;
  title: string;
  author_name: string;
  cover_url: string | null;
}

async function getNewReleasesFromFollowedAuthors(userId?: string): Promise<FollowedAuthorBook[]> {
  if (!userId) return [];

  const supabase = createClient();

  const { data: follows } = await supabase
    .from('follows')
    .select('following_id')
    .eq('follower_id', userId);

  if (!follows || follows.length === 0) return [];

  const followingIds = follows.map((f) => f.following_id);

  const { data: authors } = await supabase
    .from('users')
    .select('display_name')
    .in('id', followingIds)
    .eq('is_verified_author', true);

  if (!authors || authors.length === 0) return [];

  const authorNames = authors.map((a) => a.display_name).filter(Boolean) as string[];

  // Use ilike ANY with a manual OR approach — Supabase doesn't expose ilike any directly,
  // so we build a filter string for the PostgREST `or` operator.
  const orFilter = authorNames
    .map((name) => `author_name.ilike.${name}`)
    .join(',');

  const { data: books } = await supabase
    .from('books')
    .select('id, title, author_name, cover_url')
    .or(orFilter)
    .order('created_at', { ascending: false })
    .limit(10);

  return books ?? [];
}

async function getShelfOverlapRecommendations(userId?: string): Promise<FollowedAuthorBook[]> {
  if (!userId) return [];

  try {
    const redis = getRedisClient();
    const cacheKey = `recommendations:user:${userId}`;
    const raw = await redis.get(cacheKey);
    if (!raw) return [];

    let bookIds: string[];
    try {
      bookIds = JSON.parse(raw) as string[];
    } catch {
      return [];
    }

    if (!Array.isArray(bookIds) || bookIds.length === 0) return [];

    const supabase = createClient();
    const { data: books } = await supabase
      .from('books')
      .select('id, title, author_name, cover_url')
      .in('id', bookIds);

    // Preserve order from Redis
    return bookIds
      .map((id) => books?.find((b) => b.id === id))
      .filter((b): b is FollowedAuthorBook => b != null);
  } catch {
    return [];
  }
}

function BookCard({ item }: { item: TrendingBook }) {
  if (!item.book) return null;
  return (
    <Link
      href={`/book/${item.book.id}`}
      className="flex flex-col gap-2 hover:opacity-80 transition-opacity"
    >
      <div className="relative w-full aspect-[2/3] rounded-md overflow-hidden bg-neutral-200 dark:bg-neutral-700">
        {item.book.cover_url ? (
          <Image
            src={item.book.cover_url}
            alt={item.book.title}
            fill
            className="object-cover"
            sizes="120px"
          />
        ) : (
          <div className="flex items-center justify-center h-full text-4xl">📚</div>
        )}
      </div>
      <div>
        <p className="text-sm font-semibold leading-tight line-clamp-2">{item.book.title}</p>
        <p className="text-xs text-neutral-500 dark:text-neutral-400 line-clamp-1">{item.book.author_name}</p>
      </div>
    </Link>
  );
}

export default async function DiscoverPage() {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();

  let userCountry: string | null = null;
  let recommendedBooks: TrendingBook[] = [];

  if (user) {
    const { data: profile } = await supabase
      .from('users')
      .select('country')
      .eq('id', user.id)
      .single();
    userCountry = profile?.country ?? null;
    recommendedBooks = await getRecommendedBooks(user.id);
  }

  const [trendingGlobal, trendingNational, promotedBooks, hiddenGems, topCreators, newReleasesFromFollowed, shelfOverlapRecs] = await Promise.all([
    getTrendingBooks(),
    userCountry ? getTrendingBooks(userCountry) : Promise.resolve([]),
    getPromotedBooks(),
    getHiddenGems(),
    getTopCreators(),
    getNewReleasesFromFollowedAuthors(user?.id),
    getShelfOverlapRecommendations(user?.id),
  ]);

  return (
    <div className="max-w-2xl mx-auto px-4 py-6 space-y-8">
      <div>
        <h1 className="font-display text-2xl font-bold mb-4">Discover</h1>
        <BookSearch />
      </div>

      {/* Promoted Books */}
      {promotedBooks.length > 0 && (
        <section>
          <div className="flex items-center gap-2 mb-4">
            <h2 className="font-display text-xl font-bold">Featured</h2>
            <span className="text-xs font-medium px-2 py-0.5 rounded-full bg-accent/10 text-accent">
              Promoted
            </span>
          </div>
          <div className="grid grid-cols-5 gap-3">
            {promotedBooks.map((book) => (
              <Link
                key={book.id}
                href={`/book/${book.id}`}
                className="flex flex-col gap-2 hover:opacity-80 transition-opacity"
              >
                <div className="relative w-full aspect-[2/3] rounded-md overflow-hidden bg-neutral-200 dark:bg-neutral-700 ring-2 ring-accent/30">
                  {book.cover_url ? (
                    <Image
                      src={book.cover_url}
                      alt={book.title}
                      fill
                      className="object-cover"
                      sizes="120px"
                    />
                  ) : (
                    <div className="flex items-center justify-center h-full text-4xl">📚</div>
                  )}
                </div>
                <div>
                  <p className="text-sm font-semibold leading-tight line-clamp-2">{book.title}</p>
                  <p className="text-xs text-neutral-500 dark:text-neutral-400 line-clamp-1">
                    {book.author_name}
                  </p>
                </div>
              </Link>
            ))}
          </div>
        </section>
      )}

      {/* Trending This Week */}
      {trendingGlobal.length > 0 && (
        <section>
          <h2 className="font-display text-xl font-bold mb-4">Trending This Week</h2>
          <div className="grid grid-cols-5 gap-3">
            {trendingGlobal.slice(0, 10).map((item) => (
              <BookCard key={item.book_id} item={item} />
            ))}
          </div>
        </section>
      )}

      {/* Trending in Country */}
      {userCountry && trendingNational.length > 0 && (
        <section>
          <h2 className="font-display text-xl font-bold mb-4">
            Trending in {userCountry}
          </h2>
          <div className="grid grid-cols-5 gap-3">
            {trendingNational.slice(0, 10).map((item) => (
              <BookCard key={item.book_id} item={item} />
            ))}
          </div>
        </section>
      )}

      {/* Hidden Gems */}
      {hiddenGems.length > 0 && (
        <section>
          <div className="flex items-center gap-2 mb-4">
            <h2 className="font-display text-xl font-bold">Hidden Gems</h2>
            <span className="text-xs font-medium px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-600 dark:text-emerald-400">
              Underrated
            </span>
          </div>
          <p className="text-sm text-muted-foreground mb-4">Highly rated books not many people have discovered yet.</p>
          <div className="grid grid-cols-5 gap-3">
            {hiddenGems.map((book) => (
              <Link
                key={book.id}
                href={`/book/${book.id}`}
                className="flex flex-col gap-2 hover:opacity-80 transition-opacity"
              >
                <div className="relative w-full aspect-[2/3] rounded-md overflow-hidden bg-neutral-200 dark:bg-neutral-700">
                  {book.cover_url ? (
                    <Image
                      src={book.cover_url}
                      alt={book.title}
                      fill
                      className="object-cover"
                      sizes="120px"
                    />
                  ) : (
                    <div className="flex items-center justify-center h-full text-4xl">💎</div>
                  )}
                  {book.average_rating && (
                    <div className="absolute bottom-1 right-1 bg-black/60 text-white text-xs px-1.5 py-0.5 rounded font-medium">
                      ★ {book.average_rating.toFixed(1)}
                    </div>
                  )}
                </div>
                <div>
                  <p className="text-sm font-semibold leading-tight line-clamp-2">{book.title}</p>
                  <p className="text-xs text-neutral-500 dark:text-neutral-400 line-clamp-1">{book.author_name}</p>
                </div>
              </Link>
            ))}
          </div>
        </section>
      )}

      {/* Browse by Mood */}
      <section>
        <div className="flex items-center justify-between mb-4">
          <h2 className="font-display text-xl font-bold">Browse by Mood</h2>
          <Link href="/discover/mood-ai" className="text-sm text-accent hover:underline flex items-center gap-1">
            ✨ AI Mood Search
          </Link>
        </div>
        <div className="grid grid-cols-3 sm:grid-cols-4 gap-3">
          {MOOD_TAGS.map((tag) => (
            <Link
              key={tag}
              href={`/discover/mood/${encodeURIComponent(tag.toLowerCase())}`}
              className="flex items-center justify-center px-3 py-2 rounded-lg border border-neutral-200 dark:border-neutral-700 bg-neutral-50 dark:bg-neutral-800 text-sm font-medium hover:bg-accent hover:text-white hover:border-accent transition-colors text-center"
            >
              {tag}
            </Link>
          ))}
        </div>
      </section>

      {/* Top Creators This Week */}
      {topCreators.length > 0 && (
        <section>
          <div className="flex items-center justify-between mb-4">
            <h2 className="font-display text-xl font-bold">Top Creators</h2>
            <Link href="/creator/leaderboard" className="text-sm text-accent hover:underline">
              See all
            </Link>
          </div>
          <div className="space-y-3">
            {topCreators.map((creator, i) => (
              <Link
                key={creator.user_id}
                href={`/user/${creator.username}`}
                className="flex items-center gap-3 p-3 rounded-xl border border-border hover:bg-muted transition-colors"
              >
                <span className="text-sm font-bold text-muted-foreground w-5 text-center">{i + 1}</span>
                <div className="w-9 h-9 rounded-full bg-muted overflow-hidden flex-shrink-0">
                  {creator.avatar_url && (
                    <Image src={creator.avatar_url} alt={creator.display_name} width={36} height={36} className="object-cover" />
                  )}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="font-medium text-sm line-clamp-1">{creator.display_name}</p>
                  <p className="text-xs text-muted-foreground">@{creator.username}</p>
                </div>
                <div className="text-right flex-shrink-0">
                  <p className="text-sm font-semibold text-accent">{creator.want_to_read_score}</p>
                  <p className="text-xs text-muted-foreground">want-to-reads</p>
                </div>
              </Link>
            ))}
          </div>
        </section>
      )}

      {/* New Releases from Authors You Follow */}
      {user && newReleasesFromFollowed.length > 0 && (
        <section>
          <h2 className="font-display text-xl font-bold mb-4">New Releases from Authors You Follow</h2>
          <div className="grid grid-cols-5 gap-3">
            {newReleasesFromFollowed.map((book) => (
              <Link
                key={book.id}
                href={`/book/${book.id}`}
                className="flex flex-col gap-2 hover:opacity-80 transition-opacity"
              >
                <div className="relative w-full aspect-[2/3] rounded-md overflow-hidden bg-neutral-200 dark:bg-neutral-700">
                  {book.cover_url ? (
                    <Image src={book.cover_url} alt={book.title} fill className="object-cover" sizes="120px" />
                  ) : (
                    <div className="flex items-center justify-center h-full text-4xl">📖</div>
                  )}
                </div>
                <div>
                  <p className="text-sm font-semibold leading-tight line-clamp-2">{book.title}</p>
                  <p className="text-xs text-neutral-500 dark:text-neutral-400 line-clamp-1">{book.author_name}</p>
                </div>
              </Link>
            ))}
          </div>
        </section>
      )}

      {/* Readers Like You Also Loved */}
      {user && shelfOverlapRecs.length > 0 && (
        <section>
          <h2 className="font-display text-xl font-bold mb-4">Readers Like You Also Loved</h2>
          <div className="grid grid-cols-5 gap-3">
            {shelfOverlapRecs.map((book) => (
              <Link
                key={book.id}
                href={`/book/${book.id}`}
                className="flex flex-col gap-2 hover:opacity-80 transition-opacity"
              >
                <div className="relative w-full aspect-[2/3] rounded-md overflow-hidden bg-neutral-200 dark:bg-neutral-700">
                  {book.cover_url ? (
                    <Image src={book.cover_url} alt={book.title} fill className="object-cover" sizes="120px" />
                  ) : (
                    <div className="flex items-center justify-center h-full text-4xl">📚</div>
                  )}
                </div>
                <div>
                  <p className="text-sm font-semibold leading-tight line-clamp-2">{book.title}</p>
                  <p className="text-xs text-neutral-500 dark:text-neutral-400 line-clamp-1">{book.author_name}</p>
                </div>
              </Link>
            ))}
          </div>
        </section>
      )}

      {/* Recommended for You */}
      {user && recommendedBooks.length > 0 && (
        <section>
          <h2 className="font-display text-xl font-bold mb-4">Recommended for You</h2>
          <div className="grid grid-cols-5 gap-3">
            {recommendedBooks.slice(0, 10).map((item) => (
              <BookCard key={item.book_id} item={item} />
            ))}
          </div>
        </section>
      )}
    </div>
  );
}

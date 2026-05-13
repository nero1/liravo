import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

export async function GET(request: Request) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const url = new URL(request.url);
  const cursor = url.searchParams.get('cursor');
  const limit = 20;

  // Get list of users the current user follows
  const { data: follows } = await supabase
    .from('follows')
    .select('following_id')
    .eq('follower_id', user.id);

  const followedIds = (follows ?? []).map((f) => f.following_id);

  if (followedIds.length === 0) {
    return NextResponse.json({ items: [], nextCursor: null });
  }

  // Fetch recent shelf_books from followed users
  const shelfBooksQuery = supabase
    .from('shelf_books')
    .select(`
      id, added_at, finished_at, user_id,
      books:book_id (id, title, author_name, cover_url),
      users:user_id (display_name, avatar_url, username),
      shelves:shelf_id (name, default_type)
    `)
    .in('user_id', followedIds)
    .order('added_at', { ascending: false })
    .limit(limit);

  if (cursor) {
    shelfBooksQuery.lt('added_at', cursor);
  }

  const { data: shelfBooks } = await shelfBooksQuery;

  // Fetch recent reviews from followed users
  const reviewsQuery = supabase
    .from('reviews')
    .select(`
      id, created_at, rating, review_type, content, user_id,
      books:book_id (id, title, author_name, cover_url),
      users:user_id (display_name, avatar_url, username)
    `)
    .in('user_id', followedIds)
    .eq('moderation_status', 'published')
    .eq('is_hidden', false)
    .order('created_at', { ascending: false })
    .limit(limit);

  if (cursor) {
    reviewsQuery.lt('created_at', cursor);
  }

  const { data: reviews } = await reviewsQuery;

  // Combine and tag items
  const shelfItems = (shelfBooks ?? []).map((sb) => ({
    type: 'shelf_book' as const,
    id: `sb-${sb.id}`,
    timestamp: sb.added_at,
    userId: sb.user_id,
    user: sb.users,
    book: sb.books,
    shelf: sb.shelves,
    finishedAt: sb.finished_at,
  }));

  const reviewItems = (reviews ?? []).map((r) => ({
    type: 'review' as const,
    id: `rv-${r.id}`,
    timestamp: r.created_at,
    userId: r.user_id,
    user: r.users,
    book: r.books,
    rating: r.rating,
    reviewType: r.review_type,
    excerpt: r.content ? r.content.slice(0, 200) : null,
  }));

  // Merge and sort by timestamp descending
  const allItems = [...shelfItems, ...reviewItems].sort(
    (a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()
  );

  const paginated = allItems.slice(0, limit);
  const nextCursor =
    paginated.length === limit ? paginated[paginated.length - 1].timestamp : null;

  return NextResponse.json({ items: paginated, nextCursor });
}

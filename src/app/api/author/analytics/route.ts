import { NextResponse } from 'next/server';
import { createClient, createServiceClient } from '@/lib/supabase/server';
import { getCurrentUser } from '@/lib/auth/getCurrentUser';

export const dynamic = 'force-dynamic';

export async function GET() {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const supabase = createClient();
  const { data: profile } = await supabase
    .from('users')
    .select('is_verified_author, display_name, author_names:display_name')
    .eq('id', user.id)
    .single();

  if (!profile?.is_verified_author) {
    return NextResponse.json({ error: 'Author access required' }, { status: 403 });
  }

  const serviceSupabase = createServiceClient();
  const authorName = profile.display_name;

  // Books by this author
  const { data: books } = await serviceSupabase
    .from('books')
    .select('id, title, cover_url, average_rating, ratings_count, currently_reading_count, want_to_read_count, have_read_count')
    .ilike('author_name', authorName)
    .order('have_read_count', { ascending: false })
    .limit(50);

  const bookIds = (books ?? []).map((b) => b.id);

  let totalWantToReads = 0;
  let totalReviews = 0;
  let totalCurrentlyReading = 0;

  for (const b of books ?? []) {
    totalWantToReads += b.want_to_read_count ?? 0;
    totalCurrentlyReading += b.currently_reading_count ?? 0;
  }

  if (bookIds.length > 0) {
    const { count: reviewCount } = await serviceSupabase
      .from('reviews')
      .select('*', { count: 'exact', head: true })
      .in('book_id', bookIds)
      .eq('moderation_status', 'published');
    totalReviews = reviewCount ?? 0;
  }

  // Recent reviews
  const { data: recentReviews } = bookIds.length > 0
    ? await serviceSupabase
        .from('reviews')
        .select('id, rating, content, created_at, books:book_id(title), users:user_id(display_name, username)')
        .in('book_id', bookIds)
        .eq('moderation_status', 'published')
        .order('created_at', { ascending: false })
        .limit(5)
    : { data: [] };

  // Follower count
  const { count: followerCount } = await serviceSupabase
    .from('follows')
    .select('*', { count: 'exact', head: true })
    .eq('following_id', user.id);

  return NextResponse.json({
    books: books ?? [],
    totalWantToReads,
    totalCurrentlyReading,
    totalReviews,
    followerCount: followerCount ?? 0,
    recentReviews: recentReviews ?? [],
  });
}

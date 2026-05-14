import { createClient } from '@/lib/supabase/server';
import { NextResponse } from 'next/server';

export async function GET(
  _req: Request,
  { params }: { params: { username: string } }
) {
  const supabase = createClient();

  const { data: author, error } = await supabase
    .from('users')
    .select('id, username, display_name, bio, avatar_url, banner_url, is_verified_author, is_author, xp, user_types, external_links')
    .eq('username', params.username)
    .single();

  if (error || !author) {
    return NextResponse.json({ error: 'Author not found' }, { status: 404 });
  }

  const { data: books } = await supabase
    .from('author_books')
    .select('id, book_id, author_id, created_at')
    .eq('author_id', author.id)
    .limit(20);

  const { data: posts } = await supabase
    .from('author_posts')
    .select('id, title, body, type, book_id, created_at')
    .eq('author_id', author.id)
    .order('created_at', { ascending: false })
    .limit(10);

  const { data: arcs } = await supabase
    .from('arcs')
    .select('id, book_id, description, reader_slots, close_date, created_at')
    .eq('author_id', author.id)
    .eq('is_active', true)
    .limit(10);

  const { data: followerCount } = await supabase
    .from('follows')
    .select('follower_id', { count: 'exact', head: true })
    .eq('following_id', author.id);

  return NextResponse.json({
    author,
    books: books ?? [],
    posts: posts ?? [],
    arcs: arcs ?? [],
    followerCount: (followerCount as unknown as number) ?? 0,
  });
}

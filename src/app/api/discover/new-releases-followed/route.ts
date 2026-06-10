import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { getCurrentUser } from '@/lib/auth/getCurrentUser';

export const dynamic = 'force-dynamic';

export async function GET() {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ books: [] });

  const supabase = createClient();

  const { data: follows } = await supabase
    .from('follows')
    .select('following_id')
    .eq('follower_id', user.id);

  if (!follows || follows.length === 0) return NextResponse.json({ books: [] });

  const followingIds = follows.map((f) => f.following_id);

  const { data: authors } = await supabase
    .from('users')
    .select('display_name')
    .in('id', followingIds)
    .eq('is_verified_author', true);

  if (!authors || authors.length === 0) return NextResponse.json({ books: [] });

  const authorNames = authors.map((a) => a.display_name).filter(Boolean) as string[];
  const orFilter = authorNames.map((name) => `author_name.ilike.${name}`).join(',');

  const { data: books } = await supabase
    .from('books')
    .select('id, title, author_name, cover_url')
    .or(orFilter)
    .order('created_at', { ascending: false })
    .limit(10);

  return NextResponse.json({ books: books ?? [] });
}

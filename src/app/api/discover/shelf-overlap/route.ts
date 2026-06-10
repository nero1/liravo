import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { getCurrentUser } from '@/lib/auth/getCurrentUser';
import { getRedisClient } from '@/lib/redis';

export const dynamic = 'force-dynamic';

export async function GET() {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ books: [] });

  try {
    const redis = getRedisClient();
    const raw = await redis.get(`recommendations:user:${user.id}`);
    if (!raw) return NextResponse.json({ books: [] });

    const bookIds = JSON.parse(raw) as string[];
    if (!Array.isArray(bookIds) || bookIds.length === 0) return NextResponse.json({ books: [] });

    const supabase = createClient();
    const { data: books } = await supabase
      .from('books')
      .select('id, title, author_name, cover_url')
      .in('id', bookIds);

    const ordered = bookIds
      .map((id) => books?.find((b) => b.id === id))
      .filter(Boolean);

    return NextResponse.json({ books: ordered });
  } catch {
    return NextResponse.json({ books: [] });
  }
}

import { createServiceClient } from '@/lib/supabase/server';
import { NextResponse } from 'next/server';
import { checkCriticalRateLimit } from '@/lib/rate-limit';
import { getClientIp } from '@/lib/utils';
import { getCurrentUser } from '@/lib/auth/getCurrentUser';

export const dynamic = 'force-dynamic';

export async function GET(req: Request) {
  const ip = getClientIp(req);
  const rate = await checkCriticalRateLimit(ip);
  if (!rate.allowed) return NextResponse.json({ error: 'Too many requests' }, { status: 429 });

  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const format = searchParams.get('format');

  const service = createServiceClient();

  const [profile, shelfBooks, reviews, quotes, tips] = await Promise.all([
    service.from('users').select('username, display_name, bio, country, genres, user_types, created_at').eq('id', user.id).single(),
    service.from('shelf_books').select(`
      added_at, finished_at, rating, notes,
      books:book_id (title, author_name, isbn),
      shelves:shelf_id (name)
    `).eq('user_id', user.id).order('added_at', { ascending: false }),
    service.from('reviews').select('content, rating, mood_tags, created_at, books:book_id (title, author_name)').eq('user_id', user.id).order('created_at', { ascending: false }),
    service.from('quotes').select('content, page_number, created_at, books:book_id (title, author_name)').eq('user_id', user.id).order('created_at', { ascending: false }),
    service.from('tips').select('amount, currency, created_at').eq('sender_id', user.id).order('created_at', { ascending: false }),
  ]);

  const accept = req.headers.get('accept') ?? '';

  if (format === 'csv' || accept.includes('text/csv')) {
    // CSV export of shelf (most useful for users migrating away)
    const rows = [
      ['Title', 'Author', 'ISBN', 'Shelf', 'Date Added', 'Date Finished', 'Rating', 'Notes'],
      ...(shelfBooks.data ?? []).map((sb) => {
        const book = (sb.books as unknown) as { title?: string; author_name?: string; isbn?: string } | null;
        const shelf = (sb.shelves as unknown) as { name?: string } | null;
        return [
          book?.title ?? '',
          book?.author_name ?? '',
          book?.isbn ?? '',
          shelf?.name ?? '',
          sb.added_at ?? '',
          sb.finished_at ?? '',
          sb.rating ?? '',
          sb.notes ?? '',
        ];
      }),
    ];

    const csv = rows.map((r) => r.map((cell) => `"${String(cell).replace(/"/g, '""')}"`).join(',')).join('\n');

    return new Response(csv, {
      headers: {
        'Content-Type': 'text/csv',
        'Content-Disposition': `attachment; filename="liravo-reading-history-${new Date().toISOString().slice(0, 10)}.csv"`,
      },
    });
  }

  // JSON export (full data)
  const payload = {
    exported_at: new Date().toISOString(),
    profile: profile.data,
    reading_history: shelfBooks.data ?? [],
    reviews: reviews.data ?? [],
    quotes: quotes.data ?? [],
    tips_sent: tips.data ?? [],
  };

  return new Response(JSON.stringify(payload, null, 2), {
    headers: {
      'Content-Type': 'application/json',
      'Content-Disposition': `attachment; filename="liravo-data-export-${new Date().toISOString().slice(0, 10)}.json"`,
    },
  });
}

import { createServiceClient } from '@/lib/supabase/server';
import { NextResponse } from 'next/server';

export async function POST(req: Request) {
  const secret = req.headers.get('x-cron-secret');
  if (!secret || secret !== process.env.CRON_SECRET) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const supabase = createServiceClient();

  // Fetch top 500 books by shelf_books count
  const { data: books } = await supabase
    .from('books')
    .select('id, title, have_read_count, want_to_read_count, currently_reading_count')
    .order('have_read_count', { ascending: false })
    .limit(500);

  let checked = 0;
  let flagged = 0;

  for (const book of books ?? []) {
    checked++;

    // Check if any affiliate link clicks exist for this book
    const { count } = await supabase
      .from('affiliate_link_clicks')
      .select('id', { count: 'exact', head: true })
      .eq('book_id', book.id)
      .eq('is_affiliate', true);

    if ((count ?? 0) === 0) {
      // Flag: no affiliate links have been clicked
      await supabase.from('affiliate_health_log').insert({
        book_id: book.id,
        book_title: book.title,
        issue: 'no_affiliate_clicks',
        flagged_at: new Date().toISOString(),
      });
      flagged++;
    }
  }

  return NextResponse.json({ checked, flagged });
}

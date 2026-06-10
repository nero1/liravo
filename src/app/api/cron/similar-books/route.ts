import { NextRequest, NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';

const BATCH_SIZE = 100;

export async function GET(request: NextRequest) {
  const secret = request.headers.get('x-cron-secret');
  if (!secret || secret !== process.env.CRON_SECRET) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const supabase = createServiceClient();

  const { data: books, error } = await supabase
    .from('books')
    .select('id, author_name, genres, language')
    .limit(5000);

  if (error || !books || books.length === 0) {
    return NextResponse.json({ processed: 0 });
  }

  let processed = 0;

  for (let i = 0; i < books.length; i += BATCH_SIZE) {
    const batch = books.slice(i, i + BATCH_SIZE);

    const upserts = batch.map((book) => {
      const scores: Record<string, number> = {};

      for (const candidate of books) {
        if (candidate.id === book.id) continue;

        let score = 0;
        if (candidate.author_name === book.author_name) score += 3;
        if (candidate.language === book.language) score += 1;

        const overlap = (candidate.genres ?? []).filter((g: string) =>
          (book.genres ?? []).includes(g)
        ).length;
        score += overlap;

        if (score > 0) scores[candidate.id] = score;
      }

      const similarIds = Object.entries(scores)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 5)
        .map(([id]) => id);

      return {
        book_id: book.id,
        similar_book_ids: similarIds,
        computed_at: new Date().toISOString(),
      };
    });

    await supabase
      .from('similar_books_computed')
      .upsert(upserts, { onConflict: 'book_id' });

    processed += batch.length;
  }

  return NextResponse.json({ processed });
}

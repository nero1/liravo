import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { searchGoogleBooks, googleVolumeToBookData } from '@/services/books';
import { createServiceClient } from '@/lib/supabase/server';

export async function GET(request: Request) {
  const { data: { user } } = await createClient().auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { searchParams } = new URL(request.url);
  const q = searchParams.get('q')?.trim();
  if (!q || q.length < 2) return NextResponse.json({ books: [] });

  const supabase = createServiceClient();

  // Search local DB first
  const { data: localBooks } = await supabase
    .from('books')
    .select('id, title, author_name, cover_url, published_year, google_books_id, isbn_13')
    .textSearch('search_vector', q)
    .limit(10);

  if (localBooks && localBooks.length >= 5) {
    return NextResponse.json({ books: localBooks, source: 'local' });
  }

  // Fall back to Google Books
  const volumes = await searchGoogleBooks(q);
  const books = volumes.map((v) => ({
    ...googleVolumeToBookData(v),
    google_books_id: v.id,
    _external: true,
  }));

  return NextResponse.json({ books, source: 'google' });
}

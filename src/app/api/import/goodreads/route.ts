import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

interface GoodreadsRow {
  title: string;
  author: string;
  isbn: string;
  isbn13: string;
  shelves: string;
  dateRead: string;
}

function parseCSV(text: string): GoodreadsRow[] {
  const lines = text.split('\n').filter((l) => l.trim());
  if (lines.length < 2) return [];

  const header = lines[0].split(',').map((h) => h.trim().replace(/"/g, '').toLowerCase());

  const findIdx = (keys: string[]) => {
    for (const key of keys) {
      const idx = header.findIndex((h) => h.includes(key));
      if (idx !== -1) return idx;
    }
    return -1;
  };

  const titleIdx = findIdx(['title']);
  const authorIdx = findIdx(['author']);
  const isbnIdx = findIdx(['isbn']);
  const isbn13Idx = findIdx(['isbn13']);
  const shelvesIdx = findIdx(['exclusive shelf', 'bookshelves', 'shelf']);
  const dateReadIdx = findIdx(['date read']);

  const rows: GoodreadsRow[] = [];

  for (let i = 1; i < lines.length; i++) {
    const line = lines[i];
    // Simple CSV split respecting quoted fields
    const fields: string[] = [];
    let current = '';
    let inQuotes = false;

    for (let j = 0; j < line.length; j++) {
      const ch = line[j];
      if (ch === '"') {
        inQuotes = !inQuotes;
      } else if (ch === ',' && !inQuotes) {
        fields.push(current.trim());
        current = '';
      } else {
        current += ch;
      }
    }
    fields.push(current.trim());

    const get = (idx: number) => (idx >= 0 && idx < fields.length ? fields[idx] ?? '' : '');

    const title = get(titleIdx);
    if (!title) continue;

    rows.push({
      title,
      author: get(authorIdx),
      isbn: get(isbnIdx).replace(/[^0-9X]/gi, ''),
      isbn13: get(isbn13Idx).replace(/[^0-9]/g, ''),
      shelves: get(shelvesIdx).toLowerCase(),
      dateRead: get(dateReadIdx),
    });
  }

  return rows;
}

function mapShelfType(shelves: string): 'currently_reading' | 'have_read' | 'want_to_read' {
  if (shelves.includes('read') && !shelves.includes('want') && !shelves.includes('currently')) {
    return 'have_read';
  }
  if (shelves.includes('currently')) return 'currently_reading';
  return 'want_to_read';
}

export async function POST(request: Request) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  let csvText: string;
  try {
    const formData = await request.formData();
    const file = formData.get('file') as File | null;
    if (!file) {
      return NextResponse.json({ error: 'No file provided' }, { status: 400 });
    }
    csvText = await file.text();
  } catch {
    return NextResponse.json({ error: 'Invalid form data' }, { status: 400 });
  }

  const rows = parseCSV(csvText);
  if (rows.length === 0) {
    return NextResponse.json({ imported: 0, skipped: 0 });
  }

  // Get user's default shelves
  const { data: userShelves } = await supabase
    .from('shelves')
    .select('id, default_type')
    .eq('user_id', user.id)
    .in('default_type', ['currently_reading', 'have_read', 'want_to_read']);

  const shelfMap: Record<string, string> = {};
  for (const shelf of userShelves ?? []) {
    if (shelf.default_type) {
      shelfMap[shelf.default_type] = shelf.id;
    }
  }

  let imported = 0;
  let skipped = 0;

  for (const row of rows) {
    try {
      // Try to find book by ISBN or title
      let bookId: string | null = null;

      if (row.isbn13) {
        const { data: byIsbn } = await supabase
          .from('books')
          .select('id')
          .eq('isbn_13', row.isbn13)
          .maybeSingle();
        if (byIsbn) bookId = byIsbn.id;
      }

      if (!bookId && row.isbn) {
        const { data: byIsbn10 } = await supabase
          .from('books')
          .select('id')
          .eq('isbn_10', row.isbn)
          .maybeSingle();
        if (byIsbn10) bookId = byIsbn10.id;
      }

      if (!bookId) {
        // Search by title
        const { data: byTitle } = await supabase
          .from('books')
          .select('id')
          .ilike('title', row.title.trim())
          .limit(1)
          .maybeSingle();
        if (byTitle) bookId = byTitle.id;
      }

      if (!bookId) {
        // Create minimal book record
        const { data: newBook } = await supabase
          .from('books')
          .insert({
            title: row.title.trim(),
            author_name: row.author.trim() || 'Unknown',
            isbn_13: row.isbn13 || null,
            isbn_10: row.isbn || null,
          })
          .select('id')
          .single();
        if (newBook) bookId = newBook.id;
      }

      if (!bookId) {
        skipped++;
        continue;
      }

      const shelfType = mapShelfType(row.shelves);
      const shelfId = shelfMap[shelfType];

      if (!shelfId) {
        skipped++;
        continue;
      }

      // Check if already on shelf
      const { data: existing } = await supabase
        .from('shelf_books')
        .select('id')
        .eq('book_id', bookId)
        .eq('user_id', user.id)
        .maybeSingle();

      if (existing) {
        skipped++;
        continue;
      }

      const insertData: {
        shelf_id: string;
        book_id: string;
        user_id: string;
        finished_at?: string | null;
      } = {
        shelf_id: shelfId,
        book_id: bookId,
        user_id: user.id,
      };

      if (shelfType === 'have_read' && row.dateRead) {
        const parsed = new Date(row.dateRead);
        if (!isNaN(parsed.getTime())) {
          insertData.finished_at = parsed.toISOString();
        }
      }

      await supabase.from('shelf_books').insert(insertData);
      imported++;
    } catch {
      skipped++;
    }
  }

  return NextResponse.json({ imported, skipped });
}

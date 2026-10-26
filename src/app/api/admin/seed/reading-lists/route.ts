import { NextResponse } from 'next/server';
import { requireAdminServiceClient } from '../_auth';
import { SEED_READING_LISTS } from '../../../../../../scripts/seed/data/reading-lists';
import { SEED_BOOKS } from '../../../../../../scripts/seed/data/books';

export const dynamic = 'force-dynamic';

export async function POST() {
  const { service, error } = await requireAdminServiceClient();
  if (error) return error;

  // Resolve the editors account
  const { data: editor } = await service
    .from('users')
    .select('id')
    .eq('username', 'liravo_editors')
    .maybeSingle();

  if (!editor) {
    return NextResponse.json(
      { error: 'liravo_editors account not found. Run "Create Liravo Editors Account" first.' },
      { status: 400 }
    );
  }

  // Build isbn → book_id map
  const allIsbns = SEED_BOOKS.map((b) => b.isbn_13);
  const { data: bookRows } = await service.from('books').select('id, isbn_13').in('isbn_13', allIsbns);
  const bookMap = new Map<string, string>();
  for (const row of bookRows ?? []) {
    if (row.isbn_13) bookMap.set(row.isbn_13, row.id);
  }

  let inserted = 0;
  let skipped = 0;
  const errors: string[] = [];

  for (const list of SEED_READING_LISTS) {
    const { data: existing } = await service
      .from('reading_lists')
      .select('id')
      .eq('user_id', editor.id)
      .eq('name', list.title)
      .maybeSingle();

    if (existing) {
      skipped++;
      continue;
    }

    const { data: created, error: listErr } = await service
      .from('reading_lists')
      .insert({ user_id: editor.id, name: list.title, description: list.description, is_public: true })
      .select('id')
      .single();

    if (listErr || !created) {
      errors.push(`"${list.title}": ${listErr?.message ?? 'no id returned'}`);
      continue;
    }

    inserted++;

    const links = list.book_isbn_13s
      .map((isbn, idx) => {
        const bookId = bookMap.get(isbn);
        return bookId ? { list_id: created.id, book_id: bookId, position: idx } : null;
      })
      .filter((x): x is NonNullable<typeof x> => x !== null);

    if (links.length > 0) {
      const { error: linkErr } = await service.from('reading_list_books').insert(links);
      if (linkErr) errors.push(`Book links for "${list.title}": ${linkErr.message}`);
    }
  }

  return NextResponse.json({
    message: `Seeded reading lists: ${inserted} inserted, ${skipped} skipped`,
    inserted,
    skipped,
    errors,
  });
}

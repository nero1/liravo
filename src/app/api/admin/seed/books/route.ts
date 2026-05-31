import { NextResponse } from 'next/server';
import { requireAdminServiceClient } from '../_auth';
import { SEED_BOOKS } from '../../../../../../scripts/seed/data/books';

export const dynamic = 'force-dynamic';

const BATCH_SIZE = 50;

export async function POST() {
  const { service, error } = await requireAdminServiceClient();
  if (error) return error;

  const { data: existing } = await service
    .from('books')
    .select('isbn_13')
    .in('isbn_13', SEED_BOOKS.map((b) => b.isbn_13));

  const existingRows = (existing ?? []) as Array<{ isbn_13: string | null }>;
  const existingIsbns = new Set(existingRows.map((r) => r.isbn_13).filter((s): s is string => s !== null));
  const toInsert = SEED_BOOKS.filter((b) => !existingIsbns.has(b.isbn_13));

  let inserted = 0;
  const errors: string[] = [];

  for (let i = 0; i < toInsert.length; i += BATCH_SIZE) {
    const batch = toInsert.slice(i, i + BATCH_SIZE).map((b) => ({
      isbn_13: b.isbn_13,
      title: b.title,
      subtitle: b.subtitle ?? null,
      author_name: b.author_name,
      author_names: b.author_names,
      publisher: b.publisher ?? null,
      published_year: b.published_year ?? null,
      description: b.description ?? null,
      cover_url: b.cover_url,
      page_count: b.page_count ?? null,
      genres: b.genres,
      language: b.language,
      has_audiobook: b.has_audiobook,
      average_rating: b.average_rating ?? null,
    }));

    const { data, error: batchErr } = await service.from('books').insert(batch).select('id');
    if (batchErr) {
      errors.push(batchErr.message);
    } else {
      inserted += data?.length ?? 0;
    }
  }

  const skipped = SEED_BOOKS.length - toInsert.length;
  return NextResponse.json({
    message: `Seeded books: ${inserted} inserted, ${skipped} skipped${errors.length ? `, ${errors.length} errors` : ''}`,
    inserted,
    skipped,
    errors,
  });
}

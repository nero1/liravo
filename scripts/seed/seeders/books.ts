import type { SeedClient } from '../client.js';
import type { SeedResult } from '../utils.js';
import { isDryRun } from '../utils.js';
import { SEED_BOOKS } from '../data/books.js';

const BATCH_SIZE = 50;

export async function seedBooks(client: SeedClient): Promise<SeedResult & { bookIdsByIsbn: Map<string, string> }> {
  const result: SeedResult & { bookIdsByIsbn: Map<string, string> } = {
    inserted: 0,
    skipped: 0,
    errors: [],
    bookIdsByIsbn: new Map(),
  };

  if (isDryRun) {
    result.inserted = SEED_BOOKS.length;
    return result;
  }

  // Build existing isbn → id map
  const { data: existing } = await client
    .from('books')
    .select('id, isbn_13')
    .in('isbn_13', SEED_BOOKS.map((b) => b.isbn_13));

  const existingMap = new Map<string, string>();
  for (const row of existing ?? []) {
    if (row.isbn_13) existingMap.set(row.isbn_13, row.id);
  }

  const toInsert = SEED_BOOKS.filter((b) => !existingMap.has(b.isbn_13));
  result.skipped = SEED_BOOKS.length - toInsert.length;

  // Pre-populate result map with existing books
  for (const [isbn, id] of Array.from(existingMap)) result.bookIdsByIsbn.set(isbn, id);

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

    const { data: inserted, error } = await client
      .from('books')
      .insert(batch)
      .select('id, isbn_13');

    if (error) {
      result.errors.push(`Batch ${i / BATCH_SIZE + 1}: ${error.message}`);
    } else {
      result.inserted += inserted?.length ?? 0;
      for (const row of inserted ?? []) {
        if (row.isbn_13) result.bookIdsByIsbn.set(row.isbn_13, row.id);
      }
    }
  }

  // Reload IDs for any skipped (already existing) books that weren't in the initial map
  if (result.bookIdsByIsbn.size < SEED_BOOKS.length) {
    const missing = SEED_BOOKS.filter((b) => !result.bookIdsByIsbn.has(b.isbn_13)).map((b) => b.isbn_13);
    if (missing.length > 0) {
      const { data: rows } = await client.from('books').select('id, isbn_13').in('isbn_13', missing);
      for (const row of rows ?? []) {
        if (row.isbn_13) result.bookIdsByIsbn.set(row.isbn_13, row.id);
      }
    }
  }

  return result;
}

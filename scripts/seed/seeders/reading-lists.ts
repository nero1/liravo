import type { SeedClient } from '../client.js';
import type { SeedResult } from '../utils.js';
import { isDryRun } from '../utils.js';
import { SEED_READING_LISTS } from '../data/reading-lists.js';

export async function seedReadingLists(
  client: SeedClient,
  editorsId: string,
  bookIdsByIsbn: Map<string, string>
): Promise<SeedResult> {
  const result: SeedResult = { inserted: 0, skipped: 0, errors: [] };

  if (isDryRun) {
    result.inserted = SEED_READING_LISTS.length;
    return result;
  }

  for (const list of SEED_READING_LISTS) {
    const { data: existing } = await client
      .from('reading_lists')
      .select('id')
      .eq('user_id', editorsId)
      .eq('title', list.title)
      .maybeSingle();

    if (existing) {
      result.skipped++;
      continue;
    }

    const { data: created, error: listErr } = await client
      .from('reading_lists')
      .insert({
        user_id: editorsId,
        title: list.title,
        description: list.description,
        is_public: true,
      })
      .select('id')
      .single();

    if (listErr || !created) {
      result.errors.push(`List "${list.title}": ${listErr?.message ?? 'no id returned'}`);
      continue;
    }

    result.inserted++;

    // Link books to the list
    const bookLinks = list.book_isbn_13s
      .map((isbn, idx) => {
        const bookId = bookIdsByIsbn.get(isbn);
        if (!bookId) return null;
        return { list_id: created.id, book_id: bookId, position: idx };
      })
      .filter((x): x is NonNullable<typeof x> => x !== null);

    if (bookLinks.length === 0) continue;

    const { error: linkErr } = await client
      .from('reading_list_books')
      .insert(bookLinks);

    if (linkErr) {
      result.errors.push(`Book links for "${list.title}": ${linkErr.message}`);
    }
  }

  return result;
}

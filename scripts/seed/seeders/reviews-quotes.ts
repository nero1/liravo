import type { SeedClient } from '../client.js';
import type { SeedResult } from '../utils.js';
import { isDryRun } from '../utils.js';
import { SEED_REVIEWS, SEED_QUOTES } from '../data/reviews-quotes.js';

export async function seedReviewsAndQuotes(
  client: SeedClient,
  editorsId: string,
  bookIdsByIsbn: Map<string, string>
): Promise<SeedResult> {
  const result: SeedResult = { inserted: 0, skipped: 0, errors: [] };

  if (isDryRun) {
    result.inserted = SEED_REVIEWS.length + SEED_QUOTES.length;
    return result;
  }

  // ── Reviews ──────────────────────────────────────────────────────────────
  for (const rev of SEED_REVIEWS) {
    const bookId = bookIdsByIsbn.get(rev.book_isbn_13);
    if (!bookId) {
      result.errors.push(`Review: book ISBN ${rev.book_isbn_13} not found`);
      continue;
    }

    const { data: existing } = await client
      .from('reviews')
      .select('id')
      .eq('user_id', editorsId)
      .eq('book_id', bookId)
      .maybeSingle();

    if (existing) {
      result.skipped++;
      continue;
    }

    const { error } = await client.from('reviews').insert({
      user_id: editorsId,
      book_id: bookId,
      review_type: rev.review_type,
      rating: rev.rating,
      content: rev.content,
      mood_tags: rev.mood_tags,
      has_spoilers: false,
      moderation_status: 'published',
    });

    if (error) {
      result.errors.push(`Review for ${rev.book_isbn_13}: ${error.message}`);
    } else {
      result.inserted++;
    }
  }

  // ── Quotes ───────────────────────────────────────────────────────────────
  for (const q of SEED_QUOTES) {
    const bookId = bookIdsByIsbn.get(q.book_isbn_13);
    if (!bookId) {
      result.errors.push(`Quote: book ISBN ${q.book_isbn_13} not found`);
      continue;
    }

    const { data: existing } = await client
      .from('quotes')
      .select('id')
      .eq('user_id', editorsId)
      .eq('book_id', bookId)
      .eq('content', q.content)
      .maybeSingle();

    if (existing) {
      result.skipped++;
      continue;
    }

    const { error } = await client.from('quotes').insert({
      user_id: editorsId,
      book_id: bookId,
      content: q.content,
      page_number: q.page_number ?? null,
    });

    if (error) {
      result.errors.push(`Quote for ${q.book_isbn_13}: ${error.message}`);
    } else {
      result.inserted++;
    }
  }

  return result;
}

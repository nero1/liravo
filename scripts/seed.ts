/**
 * Deployment content seed script.
 *
 * Usage:
 *   npm run seed                    — seed everything
 *   npm run seed:dry                — dry run (no writes)
 *   npx tsx scripts/seed.ts --only=books
 *   npx tsx scripts/seed.ts --only=prompts
 *   npx tsx scripts/seed.ts --only=challenges
 *   npx tsx scripts/seed.ts --only=reading-lists
 *   npx tsx scripts/seed.ts --only=editors-account
 *   npx tsx scripts/seed.ts --only=reviews-quotes
 *
 * Required env vars (Supabase mode):
 *   NEXT_PUBLIC_SUPABASE_URL
 *   SUPABASE_SERVICE_ROLE_KEY
 *
 * Load from .env.local:
 *   export $(grep -v '^#' .env.local | xargs) && npm run seed
 */

import { getSeedClient } from './seed/client.js';
import { step, isDryRun, getOnlyFlag } from './seed/utils.js';
import { seedEditorsAccount, getEditorsId } from './seed/seeders/editors-account.js';
import { seedBooks } from './seed/seeders/books.js';
import { seedReviewsAndQuotes } from './seed/seeders/reviews-quotes.js';
import { seedPrompts } from './seed/seeders/prompts.js';
import { seedChallenges } from './seed/seeders/challenges.js';
import { seedReadingLists } from './seed/seeders/reading-lists.js';

async function main() {
  if (isDryRun) {
    console.log('\n  DRY RUN — no database writes will occur\n');
  }

  const only = getOnlyFlag();
  // In dry-run mode the client is never used (all seeders return early).
  // Avoid requiring env vars so `npm run seed:dry` works without credentials.
  const client = isDryRun
    ? ({} as ReturnType<typeof getSeedClient>)
    : getSeedClient();

  console.log('\nLiravo content seed\n───────────────────');

  let editorsId = '';
  let bookIdsByIsbn = new Map<string, string>();

  // Step 1: Editors account (must come first — FK dep for reviews/lists)
  if (!only || only === 'editors-account') {
    const r = await step('Liravo Editors account', () => seedEditorsAccount(client));
    editorsId = r.editorsId;
  }

  // Resolve editors ID if we skipped the above step
  if (!editorsId && !isDryRun) {
    editorsId = (await getEditorsId(client)) ?? '';
    if (!editorsId && (only === 'reviews-quotes' || only === 'reading-lists')) {
      console.error('\nERROR: liravo_editors account not found. Run editors-account seed first.');
      process.exit(1);
    }
  }

  // Step 2: Books (must come before reviews, quotes, and reading-list books)
  if (!only || only === 'books') {
    const r = await step('Books (100 titles)', () => seedBooks(client));
    bookIdsByIsbn = r.bookIdsByIsbn;
    bookIdsByIsbn = r.bookIdsByIsbn;
  }

  // Reload book IDs if we skipped books step but need them later
  if (!isDryRun && bookIdsByIsbn.size === 0 && (only === 'reviews-quotes' || only === 'reading-lists')) {
    const { SEED_BOOKS } = await import('./seed/data/books.js');
    const { data } = await client.from('books').select('id, isbn_13').in('isbn_13', SEED_BOOKS.map((b) => b.isbn_13));
    for (const row of data ?? []) {
      if (row.isbn_13) bookIdsByIsbn.set(row.isbn_13, row.id);
    }
  }

  // Step 3: Reviews & quotes (requires editors + books)
  if (!only || only === 'reviews-quotes') {
    if (editorsId) {
      await step('Reviews & quotes', () => seedReviewsAndQuotes(client, editorsId, bookIdsByIsbn));
    } else {
      console.log('  Reviews & quotes... skipped (no editors account)');
    }
  }

  // Step 4: Writing prompts (no FK deps)
  if (!only || only === 'prompts') {
    await step('Writing prompts (63 days)', () => seedPrompts(client));
  }

  // Step 5: Writing challenges (no FK deps)
  if (!only || only === 'challenges') {
    await step('Writing challenges', () => seedChallenges(client));
  }

  // Step 6: Reading lists + books (requires editors + books)
  if (!only || only === 'reading-lists') {
    if (editorsId) {
      await step('Reading lists (20 lists)', () => seedReadingLists(client, editorsId, bookIdsByIsbn));
    } else {
      console.log('  Reading lists... skipped (no editors account)');
    }
  }

  if (!only && !isDryRun) {
    console.log('\n───────────────────\nVerification:');
    await verify(client);
  }

  console.log('\nDone.\n');
}

async function verify(client: ReturnType<typeof getSeedClient>) {
  const checks: Array<{ label: string; table: string; filter?: Record<string, unknown>; min?: number }> = [
    { label: 'liravo_editors account', table: 'users', filter: { username: 'liravo_editors' } },
    { label: 'Books', table: 'books', min: 90 },
    { label: 'Writing prompts', table: 'writing_prompts', min: 55 },
    { label: 'Writing challenges', table: 'writing_challenges', min: 5 },
    { label: 'Reading lists', table: 'reading_lists', min: 15 },
    { label: 'Reviews', table: 'reviews', min: 25 },
    { label: 'Quotes', table: 'quotes', min: 30 },
  ];

  for (const check of checks) {
    let query = client.from(check.table).select('id', { count: 'exact', head: true });
    if (check.filter) {
      for (const [k, v] of Object.entries(check.filter)) {
        query = query.eq(k, v);
      }
    }
    const { count } = await query;
    const n = count ?? 0;
    const pass = check.min ? n >= check.min : n > 0;
    const label = `  [${pass ? 'PASS' : 'FAIL'}] ${check.label}`;
    const detail = check.min ? ` — ${n} rows (min ${check.min})` : ` — found`;
    console.log(label + detail);
  }
}

main().catch((err) => {
  console.error('\nSeed failed:', err instanceof Error ? err.message : String(err));
  process.exit(1);
});

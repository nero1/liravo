import type { SeedClient } from '../client.js';
import type { SeedResult } from '../utils.js';
import { isDryRun } from '../utils.js';
import { SEED_CHALLENGES } from '../data/challenges.js';

export async function seedChallenges(client: SeedClient): Promise<SeedResult> {
  const result: SeedResult = { inserted: 0, skipped: 0, errors: [] };

  if (isDryRun) {
    result.inserted = SEED_CHALLENGES.length;
    return result;
  }

  for (const c of SEED_CHALLENGES) {
    const { data: existing } = await client
      .from('writing_challenges')
      .select('id')
      .eq('title', c.title)
      .maybeSingle();

    if (existing) {
      result.skipped++;
      continue;
    }

    const { error } = await client.from('writing_challenges').insert({
      title: c.title,
      description: c.description,
      type: c.type,
      start_date: c.start_date,
      end_date: c.end_date,
      is_active: c.is_active,
    });

    if (error) {
      result.errors.push(`Challenge "${c.title}": ${error.message}`);
    } else {
      result.inserted++;
    }
  }

  return result;
}

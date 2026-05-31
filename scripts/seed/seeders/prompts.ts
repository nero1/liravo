import type { SeedClient } from '../client.js';
import type { SeedResult } from '../utils.js';
import { isDryRun } from '../utils.js';
import { SEED_PROMPTS } from '../data/prompts.js';

function toDateString(daysFromNow: number): string {
  const d = new Date();
  d.setDate(d.getDate() + daysFromNow);
  return d.toISOString().split('T')[0]; // YYYY-MM-DD
}

export async function seedPrompts(client: SeedClient): Promise<SeedResult> {
  const result: SeedResult = { inserted: 0, skipped: 0, errors: [] };

  if (isDryRun) {
    result.inserted = SEED_PROMPTS.length;
    return result;
  }

  for (let i = 0; i < SEED_PROMPTS.length; i++) {
    const p = SEED_PROMPTS[i];
    const promptDate = toDateString(i + 1); // starts tomorrow

    // writing_prompts has no unique constraint on prompt_date — check manually
    const { data: existing } = await client
      .from('writing_prompts')
      .select('id')
      .eq('prompt_date', promptDate)
      .maybeSingle();

    if (existing) {
      result.skipped++;
      continue;
    }

    const { error } = await client.from('writing_prompts').insert({
      prompt_text: p.prompt_text,
      topic_seed: p.topic_seed,
      is_active: true,
      prompt_date: promptDate,
    });

    if (error) {
      result.errors.push(`Prompt day ${i + 1} (${promptDate}): ${error.message}`);
    } else {
      result.inserted++;
    }
  }

  return result;
}

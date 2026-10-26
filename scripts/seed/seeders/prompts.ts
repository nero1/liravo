import type { SeedClient } from '../client.js';
import type { SeedResult } from '../utils.js';
import { isDryRun } from '../utils.js';
import { SEED_PROMPTS } from '../data/prompts.js';

function toDateString(daysFromNow: number): string {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() + daysFromNow);
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

    const { data, error: error } = await client.rpc('publish_writing_prompt', {
      p_date: promptDate, p_text: p.prompt_text, p_theme: p.topic_seed,
    });
    if (error) {
      result.errors.push(`Prompt day ${i + 1} (${promptDate}): ${error.message}`);
    } else if (data?.created) {
      result.inserted++;
    } else {
      result.skipped++;
    }
  }

  return result;
}

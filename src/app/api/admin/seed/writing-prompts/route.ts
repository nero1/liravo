import { NextResponse } from 'next/server';
import { requireAdminServiceClient } from '../_auth';
import { SEED_PROMPTS } from '../../../../../../scripts/seed/data/prompts';

export const dynamic = 'force-dynamic';

function toDateString(daysFromNow: number): string {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() + daysFromNow);
  return d.toISOString().split('T')[0];
}

export async function POST() {
  const { service, error } = await requireAdminServiceClient();
  if (error) return error;

  let inserted = 0;
  let skipped = 0;
  const errors: string[] = [];

  for (let i = 0; i < SEED_PROMPTS.length; i++) {
    const p = SEED_PROMPTS[i];
    const promptDate = toDateString(i + 1);

    const { data, error: insertErr } = await service.rpc('publish_writing_prompt', {
      p_date: promptDate, p_text: p.prompt_text, p_theme: p.topic_seed,
    });
    if (insertErr) {
      errors.push(`Day ${i + 1}: ${insertErr.message}`);
    } else if (data?.created) {
      inserted++;
    } else {
      skipped++;
    }
  }

  return NextResponse.json({
    message: `Seeded writing prompts: ${inserted} inserted, ${skipped} skipped${errors.length ? `, ${errors.length} errors` : ''}`,
    inserted,
    skipped,
    errors,
  });
}

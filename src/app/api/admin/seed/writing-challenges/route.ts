import { NextResponse } from 'next/server';
import { requireAdminServiceClient } from '../_auth';
import { SEED_CHALLENGES } from '../../../../../../scripts/seed/data/challenges';

export const dynamic = 'force-dynamic';

export async function POST() {
  const { service, error } = await requireAdminServiceClient();
  if (error) return error;

  let inserted = 0;
  let skipped = 0;
  const errors: string[] = [];

  for (const c of SEED_CHALLENGES) {
    const { data: existing } = await service
      .from('writing_challenges')
      .select('id')
      .eq('title', c.title)
      .maybeSingle();

    if (existing) {
      skipped++;
      continue;
    }

    const { error: insertErr } = await service.from('writing_challenges').insert({
      title: c.title,
      description: c.description,
      type: c.type,
      start_date: c.start_date,
      end_date: c.end_date,
      is_active: c.is_active,
    });

    if (insertErr) {
      errors.push(`"${c.title}": ${insertErr.message}`);
    } else {
      inserted++;
    }
  }

  return NextResponse.json({
    message: `Seeded writing challenges: ${inserted} inserted, ${skipped} skipped`,
    inserted,
    skipped,
    errors,
  });
}

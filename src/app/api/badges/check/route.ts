import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { checkAndAwardBadges } from '@/services/badges';
import { z } from 'zod';

export const dynamic = 'force-dynamic';

const BodySchema = z.object({
  trigger: z.string().min(1),
});

export async function POST(request: NextRequest) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const parsed = BodySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: 'Invalid body', details: parsed.error.flatten() }, { status: 400 });
  }

  const { trigger } = parsed.data;

  const awarded = await checkAndAwardBadges(user.id, trigger);

  return NextResponse.json({ awarded });
}

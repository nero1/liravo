import { NextRequest, NextResponse } from 'next/server';
import { checkAndAwardBadges } from '@/services/badges';
import { z } from 'zod';
import { getCurrentUser } from '@/lib/auth/getCurrentUser';

export const dynamic = 'force-dynamic';

const BodySchema = z.object({
  trigger: z.string().min(1),
});

export async function POST(request: NextRequest) {
  const user = await getCurrentUser();

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

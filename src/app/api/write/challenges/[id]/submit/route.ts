import { NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/auth/getCurrentUser';
import { applyWritingIntent } from '@/lib/writing-intents';
import { ContentIntentError } from '@/lib/content-intents';
import { z } from 'zod';
import { checkAndAwardBadges } from '@/services/badges';

export const dynamic = 'force-dynamic';

const schema = z.object({ title: z.string().trim().min(1).max(200), body: z.string().trim().min(1).max(50000), word_count: z.number().int().min(1).optional() });

export async function POST(request: Request, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 422 });
  try {
    const result = await applyWritingIntent(request,user.id,'challenge',params.id,{ title: parsed.data.title, content: parsed.data.body });
    await checkAndAwardBadges(user.id,'challenge_submit');
    await checkAndAwardBadges(user.id,'prolific_writer');
    return NextResponse.json({ entry: result }, { status: 201 });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Writing service unavailable' }, { status: error instanceof ContentIntentError ? error.status : 503 });
  }
}

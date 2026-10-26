import { NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/auth/getCurrentUser';
import { applyWritingIntent } from '@/lib/writing-intents';
import { ContentIntentError } from '@/lib/content-intents';
import { z } from 'zod';
import { checkAndAwardBadges } from '@/services/badges';

export const dynamic = 'force-dynamic';

const schema = z.object({ content: z.string().trim().min(50).max(2000) });

export async function POST(request: Request, { params }: { params: { id: string } }) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 422 });
  try {
    const result = await applyWritingIntent(request,user.id,'prompt',params.id,parsed.data);
    await checkAndAwardBadges(user.id,'prompt_submit');
    await checkAndAwardBadges(user.id,'prolific_writer');
    return NextResponse.json({ submission: result }, { status: 201 });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Writing service unavailable' }, { status: error instanceof ContentIntentError ? error.status : 503 });
  }
}

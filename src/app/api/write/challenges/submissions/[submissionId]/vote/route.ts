import { NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/auth/getCurrentUser';
import { applyWritingIntent } from '@/lib/writing-intents';
import { ContentIntentError } from '@/lib/content-intents';
import { z } from 'zod';

export const dynamic = 'force-dynamic';

const schema = z.object({ voted: z.boolean() });

export async function POST(request: Request, props: { params: Promise<{ submissionId: string }> }) {
  const params = await props.params;
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 422 });
  try {
    const result = await applyWritingIntent(request,user.id,'vote',params.submissionId,parsed.data);
    return NextResponse.json(result, { status: 200 });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Writing service unavailable' }, { status: error instanceof ContentIntentError ? error.status : 503 });
  }
}

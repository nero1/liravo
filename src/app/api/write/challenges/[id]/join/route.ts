import { NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/auth/getCurrentUser';
import { applyWritingIntent } from '@/lib/writing-intents';
import { ContentIntentError } from '@/lib/content-intents';

export const dynamic = 'force-dynamic';

export async function POST(request: Request, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  try {
    const result = await applyWritingIntent(request,user.id,'join',params.id,{});
    return NextResponse.json(result, { status: 200 });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Writing service unavailable' }, { status: error instanceof ContentIntentError ? error.status : 503 });
  }
}

import {checkRouteRateLimit} from '@/lib/rate-limit';
import { NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/auth/getCurrentUser';
import { applyWritingIntent } from '@/lib/writing-intents';
import { ContentIntentError } from '@/lib/content-intents';
import { z } from 'zod';

export const dynamic = 'force-dynamic';

const schema = z.object({ answer_id: z.string().uuid() });

export async function POST(request: Request, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 422 });
  if(!(await checkRouteRateLimit(user.id,'social')))return NextResponse.json({error:'Too many requests'},{status:429});
  try {
    const result = await applyWritingIntent(request,user.id,'best_answer',params.id,parsed.data);
    return NextResponse.json({...result,actorId:user.id,questionId:params.id,answerId:parsed.data.answer_id}, {status:200,headers:{'Cache-Control':'private, no-store'}});
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Writing service unavailable' }, { status: error instanceof ContentIntentError ? error.status : 503 });
  }
}

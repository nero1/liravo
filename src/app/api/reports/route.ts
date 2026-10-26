import { contentIntent, ContentIntentError } from '@/lib/content-intents';
import { NextResponse } from 'next/server';
import { z } from 'zod';
import { getCurrentUser } from '@/lib/auth/getCurrentUser';

export const dynamic = 'force-dynamic';

const reportSchema = z.object({
  content_type: z.enum(['review', 'quote', 'profile']),
  content_id: z.string().uuid(),
  reason: z.string().min(1).max(500),
});

export async function POST(request: Request) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const raw = await request.json();
  const parsed = reportSchema.safeParse(raw);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? 'Invalid input' }, { status: 400 });
  }

  const { content_type, content_id, reason } = parsed.data;

  // Map content_type to entity_type accepted by DB
  const entityTypeMap: Record<string, 'review' | 'quote' | 'comment' | 'user'> = {
    review: 'review',
    quote: 'quote',
    profile: 'user',
  };

  try {
    const intent=await contentIntent(request,user.id,'content_reports',{
      reporter_id: user.id,
      entity_type: entityTypeMap[content_type],
      entity_id: content_id,
      reason,
      status: 'pending',
    });
    await intent.insert();
  } catch(error) {
    return NextResponse.json({error:error instanceof Error?error.message:'Content creation unavailable'},{status:error instanceof ContentIntentError?error.status:503});
  }

  return NextResponse.json({ ok: true }, { status: 201 });
}

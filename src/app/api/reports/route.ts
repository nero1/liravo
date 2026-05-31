import { NextResponse } from 'next/server';
import { z } from 'zod';
import { createClient } from '@/lib/supabase/server';
import { getCurrentUser } from '@/lib/auth/getCurrentUser';

export const dynamic = 'force-dynamic';

const reportSchema = z.object({
  content_type: z.enum(['review', 'quote', 'profile']),
  content_id: z.string().uuid(),
  reason: z.string().min(1).max(500),
});

export async function POST(request: Request) {
  const supabase = createClient();
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

  const { error } = await supabase
    .from('content_reports')
    .insert({
      reporter_id: user.id,
      entity_type: entityTypeMap[content_type],
      entity_id: content_id,
      reason,
      status: 'pending',
    });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true }, { status: 201 });
}

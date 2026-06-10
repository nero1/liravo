import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { getCurrentUser } from '@/lib/auth/getCurrentUser';
import { z } from 'zod';

export const dynamic = 'force-dynamic';

const schema = z.object({ value: z.enum(['true', 'false']) });

export async function POST(
  request: Request,
  { params }: { params: { id: string; reviewId: string } }
) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const url = new URL(request.url);
  const parsed = schema.safeParse({ value: url.searchParams.get('value') ?? 'true' });
  if (!parsed.success) return NextResponse.json({ error: 'Invalid value' }, { status: 400 });

  const isHelpful = parsed.data.value === 'true';
  const supabase = createClient();

  // Upsert vote
  const { data: existing } = await supabase
    .from('review_helpfulness_votes')
    .select('id, is_helpful')
    .eq('review_id', params.reviewId)
    .eq('user_id', user.id)
    .maybeSingle();

  if (existing) {
    if (existing.is_helpful === isHelpful) {
      // Toggle off
      await supabase.from('review_helpfulness_votes').delete().eq('id', existing.id);
      const delta = isHelpful ? -1 : 0;
      const delta2 = isHelpful ? 0 : -1;
      await supabase.rpc('increment_review_helpfulness' as never, {
        p_review_id: params.reviewId, p_helpful_delta: delta, p_unhelpful_delta: delta2,
      } as never);
    } else {
      await supabase.from('review_helpfulness_votes').update({ is_helpful: isHelpful }).eq('id', existing.id);
      const delta = isHelpful ? 1 : -1;
      const delta2 = isHelpful ? -1 : 1;
      await supabase.rpc('increment_review_helpfulness' as never, {
        p_review_id: params.reviewId, p_helpful_delta: delta, p_unhelpful_delta: delta2,
      } as never);
    }
  } else {
    await supabase.from('review_helpfulness_votes').insert({ review_id: params.reviewId, user_id: user.id, is_helpful: isHelpful });
    await supabase.rpc('increment_review_helpfulness' as never, {
      p_review_id: params.reviewId, p_helpful_delta: isHelpful ? 1 : 0, p_unhelpful_delta: isHelpful ? 0 : 1,
    } as never);
  }

  return NextResponse.json({ ok: true });
}

export async function GET(request: Request, ctx: { params: { id: string; reviewId: string } }) {
  return POST(request, ctx);
}

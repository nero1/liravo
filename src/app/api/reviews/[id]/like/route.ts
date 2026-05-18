import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { awardXP } from '@/services/xp';
import { XP_CONFIG } from '@/constants/config';
import { z } from 'zod';
import { ensureIdempotency } from '@/lib/idempotency';
import { withRedisLock } from '@/lib/locks';

export const dynamic = 'force-dynamic';

const paramsSchema = z.object({ id: z.string().uuid() });

export async function POST(
  request: Request,
  { params }: { params: { id: string } }
) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  if (!paramsSchema.safeParse(params).success) {
    return NextResponse.json({ error: 'Invalid review id' }, { status: 400 });
  }

  const reviewId = params.id;
  const idemHeader = request.headers.get('x-idempotency-key');
  if (!idemHeader || idemHeader.length < 8) {
    // Bugfix: enforce idempotency-key for replay-safe like toggles and XP side effects.
    return NextResponse.json({ error: 'Missing/invalid idempotency key' }, { status: 400 });
  }
  const firstAttempt = await ensureIdempotency(`review-like:${user.id}:${reviewId}:${idemHeader}`, 120);
  if (!firstAttempt) return NextResponse.json({ deduped: true });

  const result = await withRedisLock(`review-like:${reviewId}:${user.id}`, 5, async () => {
    // Bugfix: prefer atomic DB function if available (toggle + count update in one transaction).
    const { data: toggled, error: toggleError } = await supabase.rpc('toggle_review_like_atomic' as never, {
      p_review_id: reviewId,
      p_user_id: user.id,
    } as never);
    if (!toggleError && typeof toggled === 'boolean') {
      if (toggled) {
        await awardXP(user.id, XP_CONFIG.REVIEW_LIKE_GIVEN, 'like_review');
        const { data: review } = await supabase.from('reviews').select('user_id').eq('id', reviewId).single();
        if (review && review.user_id !== user.id) {
          await awardXP(review.user_id, XP_CONFIG.REVIEW_LIKE_RECEIVED, 'review_liked');
        }
      }
      return NextResponse.json({ liked: toggled, mode: 'rpc' });
    }

    // Check if already liked
    const { data: existing } = await supabase
      .from('review_likes')
      .select('id')
      .eq('review_id', reviewId)
      .eq('user_id', user.id)
      .maybeSingle();

    // Bugfix: prefer user-scoped client here to reduce service-role blast radius.
    const serviceSupabase = supabase;

    if (existing) {
      // Unlike: remove the like
      const { error: unlikeError } = await serviceSupabase
        .from('review_likes')
        .delete()
        .eq('review_id', reviewId)
        .eq('user_id', user.id);
      if (unlikeError) {
        return NextResponse.json({ error: unlikeError.message }, { status: 500 });
      }

    // Decrement likes_count
      const { error: decError } = await serviceSupabase.rpc('decrement_review_likes' as never, { p_review_id: reviewId } as never);
      if (decError) {
        return NextResponse.json({ error: decError.message }, { status: 500 });
      }

      return NextResponse.json({ liked: false });
    }

    // Like: insert
    const { error } = await serviceSupabase
      .from('review_likes')
      .insert({ review_id: reviewId, user_id: user.id });

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

  // Increment likes_count
    const { error: incError } = await serviceSupabase.rpc('increment_review_likes' as never, { p_review_id: reviewId } as never);
    if (incError) {
      // Bugfix: compensate on counter update failure so likes row doesn't drift from aggregate count.
      await serviceSupabase
        .from('review_likes')
        .delete()
        .eq('review_id', reviewId)
        .eq('user_id', user.id);
      return NextResponse.json({ error: incError.message }, { status: 500 });
    }

    // Bugfix: award action-specific XP so the XP ledger stays semantically correct.
    await awardXP(user.id, XP_CONFIG.REVIEW_LIKE_GIVEN, 'like_review');

  // Award XP to the review author for receiving a like
    const { data: review } = await serviceSupabase
      .from('reviews')
      .select('user_id')
      .eq('id', reviewId)
      .single();

    if (review && review.user_id !== user.id) {
      await awardXP(review.user_id, XP_CONFIG.REVIEW_LIKE_RECEIVED, 'review_liked');
    }

    return NextResponse.json({ liked: true });
  });

  if (!result) {
    return NextResponse.json({ error: 'Action already in progress' }, { status: 409 });
  }

  return result;
}

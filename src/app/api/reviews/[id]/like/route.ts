import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createServiceClient } from '@/lib/supabase/server';
import { awardXP } from '@/services/xp';
import { XP_CONFIG } from '@/constants/config';

export async function POST(
  _request: Request,
  { params }: { params: { id: string } }
) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const reviewId = params.id;

  // Check if already liked
  const { data: existing } = await supabase
    .from('review_likes')
    .select('id')
    .eq('review_id', reviewId)
    .eq('user_id', user.id)
    .maybeSingle();

  const serviceSupabase = createServiceClient();

  if (existing) {
    // Unlike: remove the like
    await serviceSupabase
      .from('review_likes')
      .delete()
      .eq('review_id', reviewId)
      .eq('user_id', user.id);

    // Decrement likes_count
    await serviceSupabase.rpc('decrement_review_likes' as never, { p_review_id: reviewId } as never);

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
  await serviceSupabase.rpc('increment_review_likes' as never, { p_review_id: reviewId } as never);

  // Award XP to the current user for liking (2 XP per PRD)
  await awardXP(user.id, XP_CONFIG.FOLLOW_USER, 'like_review');

  // Award XP to the review author for receiving a like
  const { data: review } = await serviceSupabase
    .from('reviews')
    .select('user_id')
    .eq('id', reviewId)
    .single();

  if (review && review.user_id !== user.id) {
    await awardXP(review.user_id, XP_CONFIG.WANT_TO_READ_REACTION, 'review_liked');
  }

  return NextResponse.json({ liked: true });
}

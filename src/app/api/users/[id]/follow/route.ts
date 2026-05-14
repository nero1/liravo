import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { awardXP } from '@/services/xp';
import { createNotification } from '@/services/notifications';
import { XP_CONFIG } from '@/constants/config';
import { z } from 'zod';
import { ensureIdempotency } from '@/lib/idempotency';
import { withExponentialBackoff } from '@/lib/retry';

const paramsSchema = z.object({ id: z.string().uuid() });

export async function POST(
  request: Request,
  { params }: { params: { id: string } }
) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const targetId = params.id;
  if (!paramsSchema.safeParse(params).success) {
    return NextResponse.json({ error: 'Invalid user id' }, { status: 400 });
  }

  if (targetId === user.id) {
    return NextResponse.json({ error: 'Cannot follow yourself' }, { status: 400 });
  }

  const idemHeader = request.headers.get('x-idempotency-key');
  if (idemHeader) {
    // Bugfix: suppress duplicate side effects on client retries.
    const firstAttempt = await ensureIdempotency(`follow:${user.id}:${targetId}:${idemHeader}`, 120);
    if (!firstAttempt) return NextResponse.json({ following: true, idempotent: true });
  }

  // Bugfix: validate target existence/eligibility before creating relationship side effects.
  const { data: targetUser } = await supabase
    .from('users')
    .select('id, is_suspended')
    .eq('id', targetId)
    .maybeSingle();

  if (!targetUser) return NextResponse.json({ error: 'Target user not found' }, { status: 404 });
  if (targetUser.is_suspended) return NextResponse.json({ error: 'Target user unavailable' }, { status: 403 });

  const { error } = await supabase
    .from('follows')
    .insert({ follower_id: user.id, following_id: targetId });

  if (error) {
    if (error.code === '23505') {
      // Already following
      return NextResponse.json({ following: true });
    }
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  // Bugfix: follow relationship is source of truth; side effects are best-effort to avoid false 500s after commit.
  try {
    // Award XP to follower
    await withExponentialBackoff(() => awardXP(user.id, XP_CONFIG.FOLLOW_USER, 'follow_user'), { retries: 2 });
    // Award XP to followed user for receiving a follower
    await withExponentialBackoff(() => awardXP(targetId, XP_CONFIG.RECEIVE_FOLLOWER, 'receive_follower'), { retries: 2 });
  } catch (error) {
    console.error('follow side-effect XP failure', error);
  }

  // Get follower display name for notification
  const { data: followerProfile } = await supabase
    .from('users')
    .select('display_name')
    .eq('id', user.id)
    .single();

  // Create notification for the followed user
  try {
    await withExponentialBackoff(
      () => createNotification({
        userId: targetId,
        type: 'follow',
        actorId: user.id,
        entityType: 'user',
        entityId: user.id,
        message: `${followerProfile?.display_name ?? 'Someone'} started following you.`,
      }),
      { retries: 2 }
    );
  } catch (error) {
    console.error('follow side-effect notification failure', error);
  }

  return NextResponse.json({ following: true });
}

export async function DELETE(
  _request: Request,
  { params }: { params: { id: string } }
) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const targetId = params.id;
  if (!paramsSchema.safeParse(params).success) {
    return NextResponse.json({ error: 'Invalid user id' }, { status: 400 });
  }

  const { error } = await supabase
    .from('follows')
    .delete()
    .eq('follower_id', user.id)
    .eq('following_id', targetId);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ following: false });
}

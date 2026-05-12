import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { awardXP } from '@/services/xp';
import { createNotification } from '@/services/notifications';
import { XP_CONFIG } from '@/constants/config';

export async function POST(
  _request: Request,
  { params }: { params: { id: string } }
) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const targetId = params.id;
  if (targetId === user.id) {
    return NextResponse.json({ error: 'Cannot follow yourself' }, { status: 400 });
  }

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

  // Award XP to follower
  await awardXP(user.id, XP_CONFIG.FOLLOW_USER, 'follow_user');
  // Award XP to followed user for receiving a follower
  await awardXP(targetId, XP_CONFIG.RECEIVE_FOLLOWER, 'receive_follower');

  // Get follower display name for notification
  const { data: followerProfile } = await supabase
    .from('users')
    .select('display_name')
    .eq('id', user.id)
    .single();

  // Create notification for the followed user
  await createNotification({
    userId: targetId,
    type: 'follow',
    actorId: user.id,
    entityType: 'user',
    entityId: user.id,
    message: `${followerProfile?.display_name ?? 'Someone'} started following you.`,
  });

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

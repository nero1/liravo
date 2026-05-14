import { createClient } from '@/lib/supabase/server';
import { NextResponse } from 'next/server';

export async function GET() {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  // Follower count
  const { count: followerCount } = await supabase
    .from('follows')
    .select('follower_id', { count: 'exact', head: true })
    .eq('following_id', user.id);

  // Review count
  const { count: reviewCount } = await supabase
    .from('reviews')
    .select('id', { count: 'exact', head: true })
    .eq('user_id', user.id);

  // Want-to-read triggered: sum of want_to_read_count on reviews by this user
  const { data: reviews } = await supabase
    .from('reviews')
    .select('want_to_read_count')
    .eq('user_id', user.id);

  const wantToReadTriggered = (reviews ?? []).reduce(
    (sum, r) => sum + (r.want_to_read_count ?? 0),
    0
  );

  // Tips received (sum from tips table)
  const { data: tips } = await supabase
    .from('tips')
    .select('recipient_amount')
    .eq('recipient_id', user.id)
    .eq('status', 'completed');

  const tipsReceived = (tips ?? []).reduce(
    (sum: number, t: { recipient_amount: number }) => sum + (t.recipient_amount ?? 0),
    0
  );

  return NextResponse.json({
    follower_count: followerCount ?? 0,
    review_count: reviewCount ?? 0,
    want_to_read_triggered: wantToReadTriggered,
    tips_received: tipsReceived,
  });
}

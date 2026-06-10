import { createClient } from '@/lib/supabase/server';
import { NextRequest, NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  const supabase = createClient();

  const { searchParams } = new URL(req.url);
  const period = searchParams.get('period') ?? 'monthly'; // 'weekly' | 'monthly' | 'all_time'

  let startDate: string | null = null;
  if (period === 'weekly') {
    const d = new Date();
    d.setDate(d.getDate() - 7);
    startDate = d.toISOString();
  } else if (period === 'monthly') {
    const d = new Date();
    d.setMonth(d.getMonth() - 1);
    startDate = d.toISOString();
  }

  // Aggregate submission counts per user
  let query = supabase
    .from('prompt_submissions')
    .select('user_id');

  if (startDate) {
    query = query.gte('created_at', startDate);
  }

  const { data: subs } = await query;

  if (!subs || subs.length === 0) {
    return NextResponse.json({ leaderboard: [] });
  }

  // Count per user
  const counts: Record<string, number> = {};
  for (const sub of subs as Array<{ user_id: string }>) {
    counts[sub.user_id] = (counts[sub.user_id] ?? 0) + 1;
  }

  // Top 20 users
  const sorted = Object.entries(counts)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 20);

  const userIds = sorted.map(([uid]) => uid);
  const { data: users } = await supabase
    .from('users')
    .select('id, display_name, username, avatar_url, xp')
    .in('id', userIds);

  const userMap = new Map((users ?? []).map((u: { id: string; display_name: string; username: string; avatar_url: string | null; xp: number }) => [u.id, u]));

  const leaderboard = sorted.map(([uid, count], idx) => {
    const user = userMap.get(uid);
    return {
      rank: idx + 1,
      user_id: uid,
      display_name: user?.display_name ?? 'Unknown',
      username: user?.username ?? '',
      avatar_url: user?.avatar_url ?? null,
      xp: user?.xp ?? 0,
      submissions_count: count,
    };
  });

  return NextResponse.json({ leaderboard, period });
}

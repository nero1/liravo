import { NextRequest, NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase/server';
import { getRedisClient } from '@/lib/redis';

// Snapshot the current global XP leaderboard into Redis weekly keys
// and reset weekly XP counters

export async function GET(request: NextRequest) {
  const secret = request.headers.get('x-cron-secret');
  if (!secret || secret !== process.env.CRON_SECRET) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const supabase = createServiceClient();
  const redis = getRedisClient();

  // Get top 100 users by XP
  const { data: users, error } = await supabase
    .from('users')
    .select('id, username, display_name, avatar_url, xp')
    .order('xp', { ascending: false })
    .limit(100);

  if (error || !users) {
    return NextResponse.json({ error: 'Failed to fetch users' }, { status: 500 });
  }

  const weekKey = getWeekKey();
  const snapshotKey = `leaderboard:snapshot:weekly:${weekKey}`;
  const TTL = 7 * 86400; // 1 week

  const snapshot = users.map((u, i) => ({
    rank: i + 1,
    id: u.id,
    username: u.username,
    display_name: u.display_name,
    avatar_url: u.avatar_url,
    xp: u.xp,
  }));

  await redis.set(snapshotKey, JSON.stringify(snapshot), { ex: TTL });

  // Also update the live global leaderboard cache
  await redis.set('leaderboard:global:weekly:all', JSON.stringify(snapshot), { ex: 300 });

  return NextResponse.json({
    snapshot: weekKey,
    usersSnapshotted: snapshot.length,
  });
}

function getWeekKey(): string {
  const now = new Date();
  const startOfYear = new Date(now.getFullYear(), 0, 1);
  const weekNum = Math.ceil(
    ((now.getTime() - startOfYear.getTime()) / 86400000 + startOfYear.getDay() + 1) / 7
  );
  return `${now.getFullYear()}-W${weekNum.toString().padStart(2, '0')}`;
}

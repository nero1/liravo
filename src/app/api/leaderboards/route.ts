import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { getRedisClient } from '@/lib/redis';
import { z } from 'zod';

const CACHE_TTL = 300; // 5 minutes

const QuerySchema = z.object({
  type: z.enum(['global', 'national', 'friends']).default('global'),
  period: z.enum(['weekly', 'monthly', 'alltime']).default('weekly'),
});

interface LeaderboardEntry {
  rank: number;
  id: string;
  username: string;
  display_name: string;
  avatar_url: string | null;
  xp: number;
  level_title: string;
}

function getLevelTitle(xp: number): string {
  const thresholds = [
    { min: 0, max: 499, title: 'Page Turner' },
    { min: 500, max: 1499, title: 'Bookmarked' },
    { min: 1500, max: 3999, title: 'Chapter Chaser' },
    { min: 4000, max: 7999, title: 'Spine Cracker' },
    { min: 8000, max: 14999, title: 'Literary Nomad' },
    { min: 15000, max: 24999, title: 'Wordsmith' },
    { min: 25000, max: 49999, title: 'Bibliophile' },
    { min: 50000, max: Infinity, title: 'Legend of the Shelf' },
  ];
  const level = thresholds.find((l) => xp >= l.min && xp <= l.max);
  return level?.title ?? 'Legend of the Shelf';
}

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);

  const parsed = QuerySchema.safeParse({
    type: searchParams.get('type') ?? 'global',
    period: searchParams.get('period') ?? 'weekly',
  });

  if (!parsed.success) {
    return NextResponse.json({ error: 'Invalid query params' }, { status: 400 });
  }

  const { type, period } = parsed.data;

  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const cacheKey = `leaderboard:${type}:${period}:${type === 'friends' || type === 'national' ? user.id : 'all'}`;
  const redis = getRedisClient();
  const cached = await redis.get(cacheKey);
  if (cached) {
    return NextResponse.json({ leaderboard: JSON.parse(cached) as LeaderboardEntry[], cached: true });
  }

  let entries: LeaderboardEntry[] = [];

  if (type === 'global') {
    const { data: users } = await supabase
      .from('users')
      .select('id, username, display_name, avatar_url, xp')
      .order('xp', { ascending: false })
      .limit(50);

    entries = (users ?? []).map((u, i) => ({
      rank: i + 1,
      id: u.id,
      username: u.username,
      display_name: u.display_name,
      avatar_url: u.avatar_url,
      xp: u.xp,
      level_title: getLevelTitle(u.xp),
    }));
  } else if (type === 'national') {
    const { data: profile } = await supabase
      .from('users')
      .select('country')
      .eq('id', user.id)
      .single();

    if (!profile?.country) {
      return NextResponse.json({ leaderboard: [] });
    }

    const { data: users } = await supabase
      .from('users')
      .select('id, username, display_name, avatar_url, xp')
      .eq('country', profile.country)
      .order('xp', { ascending: false })
      .limit(50);

    entries = (users ?? []).map((u, i) => ({
      rank: i + 1,
      id: u.id,
      username: u.username,
      display_name: u.display_name,
      avatar_url: u.avatar_url,
      xp: u.xp,
      level_title: getLevelTitle(u.xp),
    }));
  } else if (type === 'friends') {
    const { data: follows } = await supabase
      .from('follows')
      .select('following_id')
      .eq('follower_id', user.id);

    const followedIds = (follows ?? []).map((f) => f.following_id);
    followedIds.push(user.id); // Include self

    const { data: users } = await supabase
      .from('users')
      .select('id, username, display_name, avatar_url, xp')
      .in('id', followedIds)
      .order('xp', { ascending: false })
      .limit(50);

    entries = (users ?? []).map((u, i) => ({
      rank: i + 1,
      id: u.id,
      username: u.username,
      display_name: u.display_name,
      avatar_url: u.avatar_url,
      xp: u.xp,
      level_title: getLevelTitle(u.xp),
    }));
  }

  await redis.set(cacheKey, JSON.stringify(entries), { ex: CACHE_TTL });

  return NextResponse.json({ leaderboard: entries });
}

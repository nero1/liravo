import { createClient } from '@/lib/supabase/server';
import { NextResponse } from 'next/server';
import { getRedisClient } from '@/lib/redis';

const CACHE_KEY = 'creator:leaderboard';
const CACHE_TTL = 300; // 5 minutes

interface LeaderboardEntry {
  user_id: string;
  username: string;
  display_name: string;
  avatar_url: string | null;
  user_types: string[];
  is_verified_author: boolean;
  tips_score: number;
  want_to_read_score: number;
  total_score: number;
}

export async function GET() {
  const redis = getRedisClient();

  // Try cache
  const cached = await redis.get(CACHE_KEY);
  if (cached) {
    return NextResponse.json(JSON.parse(cached));
  }

  const supabase = createClient();

  // Get all users who are creators or authors
  const { data: users } = await supabase
    .from('users')
    .select('id, username, display_name, avatar_url, user_types, is_verified_author, is_creator')
    .limit(200);

  if (!users || users.length === 0) {
    return NextResponse.json({ leaderboard: [] });
  }

  const userIds = users.map((u) => u.id);

  // Get tips received per user (sum of recipient_amount)
  const { data: tips } = await supabase
    .from('tips')
    .select('recipient_id, recipient_amount')
    .in('recipient_id', userIds)
    .eq('status', 'completed');

  const tipsMap: Record<string, number> = {};
  for (const t of tips ?? []) {
    tipsMap[t.recipient_id] = (tipsMap[t.recipient_id] ?? 0) + (t.recipient_amount ?? 0);
  }

  // Get want_to_read triggered (sum of want_to_read_count on reviews)
  const { data: reviews } = await supabase
    .from('reviews')
    .select('user_id, want_to_read_count')
    .in('user_id', userIds);

  const wtrMap: Record<string, number> = {};
  for (const r of reviews ?? []) {
    wtrMap[r.user_id] = (wtrMap[r.user_id] ?? 0) + (r.want_to_read_count ?? 0);
  }

  const entries: LeaderboardEntry[] = users
    .map((u) => ({
      user_id: u.id,
      username: u.username,
      display_name: u.display_name,
      avatar_url: u.avatar_url,
      user_types: u.user_types ?? [],
      is_verified_author: u.is_verified_author ?? false,
      tips_score: tipsMap[u.id] ?? 0,
      want_to_read_score: wtrMap[u.id] ?? 0,
      total_score: (tipsMap[u.id] ?? 0) + (wtrMap[u.id] ?? 0),
    }))
    .filter((e) => e.total_score > 0)
    .sort((a, b) => b.total_score - a.total_score)
    .slice(0, 50);

  const result = { leaderboard: entries };
  await redis.set(CACHE_KEY, JSON.stringify(result), { ex: CACHE_TTL });

  return NextResponse.json(result);
}

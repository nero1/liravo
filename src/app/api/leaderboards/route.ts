import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { getRedisClient } from '@/lib/redis';
import { z } from 'zod';
import { getCurrentUser } from '@/lib/auth/getCurrentUser';

export const dynamic = 'force-dynamic';

const CACHE_TTL = 300; // 5 minutes

const LOCALE_TO_COUNTRY_CODE: Record<string, string> = {
  fr: 'FR',
  de: 'DE',
  en: 'US',
};

const QuerySchema = z.object({
  type: z.enum(['global', 'national', 'friends']).default('global'),
  period: z.enum(['weekly', 'monthly', 'alltime']).default('weekly'),
  locale: z.string().optional(),
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
    locale: searchParams.get('locale') ?? undefined,
  });

  if (!parsed.success) {
    return NextResponse.json({ error: 'Invalid query params' }, { status: 400 });
  }

  const { type, period, locale } = parsed.data;

  const supabase = createClient();
  const user = await getCurrentUser();

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
    // Use locale-derived country if provided, otherwise fall back to user's country setting
    let countryCode: string | undefined = locale ? LOCALE_TO_COUNTRY_CODE[locale] : undefined;

    if (!countryCode) {
      const { data: profile } = await supabase
        .from('users')
        .select('country')
        .eq('id', user.id)
        .single();

      if (!profile?.country) {
        return NextResponse.json({ leaderboard: [] });
      }
      countryCode = profile.country as string;
    }

    const { data: users } = await supabase
      .from('users')
      .select('id, username, display_name, avatar_url, xp')
      .eq('country', countryCode)
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

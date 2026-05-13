import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createServiceClient } from '@/lib/supabase/server';
import { getRedisClient } from '@/lib/redis';

export type ModeratorAction = 'approve' | 'remove' | 'warn' | 'escalate';

export async function isModerator(userId: string): Promise<boolean> {
  const redis = getRedisClient();
  const cacheKey = `moderator:${userId}`;

  try {
    const cached = await redis.get(cacheKey);
    if (cached !== null) {
      return cached === 'true';
    }
  } catch {
    // Redis unavailable — proceed to DB
  }

  const supabase = createServiceClient();
  const { data: user } = await supabase
    .from('users')
    .select('is_moderator, is_admin')
    .eq('id', userId)
    .single();

  const result = !!(user?.is_moderator || user?.is_admin);

  try {
    const redis2 = getRedisClient();
    await redis2.set(cacheKey, result ? 'true' : 'false', { ex: 60 });
  } catch {
    // Cache set failed — ignore
  }

  return result;
}

export async function requireModerator(): Promise<{ userId: string } | NextResponse> {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const mod = await isModerator(user.id);
  if (!mod) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  return { userId: user.id };
}

export async function isAdmin(userId: string): Promise<boolean> {
  const supabase = createServiceClient();
  const { data: user } = await supabase
    .from('users')
    .select('is_admin')
    .eq('id', userId)
    .single();

  return !!user?.is_admin;
}

export async function requireAdmin(): Promise<{ userId: string } | NextResponse> {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const admin = await isAdmin(user.id);
  if (!admin) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  return { userId: user.id };
}

import { cookies } from 'next/headers';
import { getRedisClient } from '@/lib/redis';
import { isDigitalOcean } from '@/lib/db/provider';

export interface SessionUser {
  id: string;
  email: string;
}

const SESSION_COOKIE = 'liravo-session';
const SESSION_TTL = 60 * 60 * 24 * 7; // 7 days

// Reads the current authenticated user in a provider-aware way.
// DO mode: reads session cookie → validates in Redis.
// Supabase mode: delegates to the Supabase auth client (wrapped in createClient()).
export async function getCurrentUser(): Promise<SessionUser | null> {
  if (isDigitalOcean()) {
    return getDoUser();
  }
  return getSupabaseUser();
}

async function getDoUser(): Promise<SessionUser | null> {
  const cookieStore = cookies();
  const token = cookieStore.get(SESSION_COOKIE)?.value;
  if (!token) return null;

  const redis = getRedisClient();
  const raw = await redis.get(`do:session:${token}`);
  if (!raw) return null;

  try {
    return JSON.parse(raw) as SessionUser;
  } catch {
    return null;
  }
}

async function getSupabaseUser(): Promise<SessionUser | null> {
  // Lazy import to avoid pulling Supabase SDK into the bundle in DO mode
  const { createClient } = await import('@/lib/supabase/server');
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;
  return { id: user.id, email: user.email ?? '' };
}

export async function createSession(user: SessionUser): Promise<string> {
  const token = crypto.randomUUID();
  const redis = getRedisClient();
  await redis.set(`do:session:${token}`, JSON.stringify(user), { ex: SESSION_TTL });
  return token;
}

export async function destroySession(token: string): Promise<void> {
  const redis = getRedisClient();
  await redis.del(`do:session:${token}`);
}

export { SESSION_COOKIE };

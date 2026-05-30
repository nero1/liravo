import { cookies } from 'next/headers';
import { getRedisClient } from '@/lib/redis';
import { isDigitalOcean } from '@/lib/db/provider';
import { SESSION_COOKIE } from '@/lib/db/unified-client';

export interface SessionUser {
  id: string;
  email: string;
}

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

// Re-export from unified-client for callers that only import from this module
export { SESSION_COOKIE } from '@/lib/db/unified-client';

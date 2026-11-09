import { cookies,headers } from 'next/headers';
import {assertSessionProviderAvailable} from '@/lib/auth/session-errors';
import { readDirectSession } from '@/lib/auth/second-factor';
import { isDirectPostgres } from '@/lib/db/provider';
import { SESSION_COOKIE } from '@/lib/db/unified-client';

export interface SessionUser {
  id: string;
  email: string;
}

// Reads the current authenticated user in a provider-aware way.
// DO mode: reads session cookie → validates in Redis.
// Supabase mode: delegates to the Supabase auth client (wrapped in createClient()).
export async function getCurrentUser(): Promise<SessionUser | null> {
  if (isDirectPostgres()) {
    return getDoUser();
  }
  return getSupabaseUser();
}

async function getDoUser(): Promise<SessionUser | null> {
  const authHeader = (await headers()).get('authorization');
  if (authHeader?.startsWith('Bearer ')) return readDirectSession(authHeader.slice(7));

  const cookieStore = await cookies();
  const token = cookieStore.get(SESSION_COOKIE)?.value;
  if (!token) return null;

  return readDirectSession(token);
}

async function getSupabaseUser(): Promise<SessionUser | null> {
  const { createClient } = await import('@/lib/supabase/server');
  const supabase = await createClient();

  const authorization=(await headers()).get('authorization');
  const bearer=authorization?.startsWith('Bearer ')?authorization.slice(7):undefined;
  const { data: { user },error } = await supabase.auth.getUser(bearer);
  assertSessionProviderAvailable(error);
  if (!user) return null;
  return { id: user.id, email: user.email ?? '' };
}

// Re-export from unified-client for callers that only import from this module
export { SESSION_COOKIE } from '@/lib/db/unified-client';

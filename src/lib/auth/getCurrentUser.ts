import { cookies } from 'next/headers';
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
  // Mobile clients send Bearer token; check it before falling back to cookies.
  try {
    const { headers } = await import('next/headers');
    const authHeader = headers().get('authorization');
    if (authHeader?.startsWith('Bearer ')) {
      const token = authHeader.slice(7);
      return readDirectSession(token);
    }
  } catch { return null; }

  const cookieStore = cookies();
  const token = cookieStore.get(SESSION_COOKIE)?.value;
  if (!token) return null;

  return readDirectSession(token);
}

async function getSupabaseUser(): Promise<SessionUser | null> {
  const { createClient } = await import('@/lib/supabase/server');
  const supabase = createClient();

  // Mobile clients send Bearer token; try it before falling back to cookies.
  try {
    const { headers } = await import('next/headers');
    const authHeader = headers().get('authorization');
    if (authHeader?.startsWith('Bearer ')) {
      const token = authHeader.slice(7);
      const { data: { user } } = await supabase.auth.getUser(token);
      return user ? { id: user.id, email: user.email ?? '' } : null;
    }
  } catch {
    return null;
  }

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;
  return { id: user.id, email: user.email ?? '' };
}

// Re-export from unified-client for callers that only import from this module
export { SESSION_COOKIE } from '@/lib/db/unified-client';

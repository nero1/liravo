'use client';

import { createBrowserClient } from '@supabase/ssr';
import type { Database } from '@/types/database';

// Browser-side DO mode placeholder — client components calling supabase.auth.signInWithOAuth
// in DO mode are guarded by NEXT_PUBLIC_DATABASE_PROVIDER checks in their JSX before
// calling this. For direct DB queries in client components, calls go through API routes.
function createDoBrowserClient() {
  return {
    auth: {
      async signInWithOAuth() {
        return { error: new Error('OAuth not supported in DO mode') };
      },
      async getUser() {
        return { data: { user: null }, error: null };
      },
      async signOut() {},
    },
    from() {
      throw new Error(
        'Direct Supabase DB calls are not available in DO mode from the browser. Use API routes instead.'
      );
    },
    storage: {
      from() {
        throw new Error(
          'Direct Supabase storage calls are not available in DO mode from the browser. Use the /api/users/avatar endpoint instead.'
        );
      },
    },
  };
}

export function createClient(): ReturnType<typeof createBrowserClient<Database>> {
  if ((process.env.NEXT_PUBLIC_DATABASE_PROVIDER ?? 'supabase') !== 'supabase') {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return createDoBrowserClient() as any;
  }

  return createBrowserClient<Database, 'public'>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  );
}

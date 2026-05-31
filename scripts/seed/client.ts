import { createClient, type SupabaseClient } from '@supabase/supabase-js';

export type SeedClient = SupabaseClient;

export function getSeedClient(): SeedClient {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    throw new Error(
      'Missing env vars: NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required.\n' +
      'If using .env.local, load it first: export $(grep -v "^#" .env.local | xargs)'
    );
  }
  return createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

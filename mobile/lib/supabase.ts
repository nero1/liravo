import * as SecureStore from 'expo-secure-store';

const isSupabaseMode = process.env.EXPO_PUBLIC_DATABASE_PROVIDER !== 'digitalocean';

const ExpoSecureStoreAdapter = {
  getItem: (key: string) => SecureStore.getItemAsync(key),
  setItem: (key: string, value: string) => SecureStore.setItemAsync(key, value),
  removeItem: (key: string) => SecureStore.deleteItemAsync(key),
};

// Only initialise the Supabase client when Supabase is the auth provider.
// When DATABASE_PROVIDER=digitalocean this module exports null so no
// Supabase SDK code is ever imported/executed in that configuration.
export const supabase = (() => {
  if (!isSupabaseMode) return null as never;
  // Dynamic require keeps the import out of DO-mode bundles entirely.
  const { createClient } = require('@supabase/supabase-js') as typeof import('@supabase/supabase-js');
  const url = process.env.EXPO_PUBLIC_SUPABASE_URL!;
  const key = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY!;
  return createClient(url, key, {
    auth: {
      storage: ExpoSecureStoreAdapter,
      autoRefreshToken: true,
      persistSession: true,
      detectSessionInUrl: false,
    },
  });
})();

export { isSupabaseMode };

import * as SecureStore from 'expo-secure-store';
import {createClient}from'@supabase/supabase-js';

const isSupabaseMode = (process.env.EXPO_PUBLIC_DATABASE_PROVIDER ?? 'supabase') === 'supabase';

const ExpoSecureStoreAdapter = {
  getItem: (key: string) => SecureStore.getItemAsync(key),
  setItem: (key: string, value: string) => SecureStore.setItemAsync(key, value),
  removeItem: (key: string) => SecureStore.deleteItemAsync(key),
};

export const supabase = (() => {
  if (!isSupabaseMode) return null;
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

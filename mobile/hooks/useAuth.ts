import { useEffect } from 'react';
import { supabase } from '@/lib/supabase';
import { useAuthStore } from '@/stores/auth';
import { api } from '@/lib/api';
import type { UserRow } from '@/types';

export function useAuth() {
  const { user, token, isLoading, setUser, setToken, setLoading, signOut } = useAuthStore();

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session) {
        setToken(session.access_token);
        fetchProfile();
      } else {
        setLoading(false);
      }
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange(async (_event, session) => {
      if (session) {
        setToken(session.access_token);
        await fetchProfile();
      } else {
        signOut();
        setLoading(false);
      }
    });

    return () => subscription.unsubscribe();
  }, []);

  async function fetchProfile() {
    try {
      const res = await api.get<{ user: UserRow }>('/api/users/profile');
      setUser(res.user);
    } catch {
      // profile fetch failed; still authenticated
    } finally {
      setLoading(false);
    }
  }

  async function logout() {
    await supabase.auth.signOut();
    signOut();
  }

  return { user, token, isLoading, logout, fetchProfile };
}

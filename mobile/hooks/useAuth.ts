import { useEffect } from 'react';
import { isSupabaseMode, supabase } from '@/lib/supabase';
import { useAuthStore } from '@/stores/auth';
import { api } from '@/lib/api';
import type { UserRow } from '@/types';

export function useAuth() {
  const { user, token, isLoading, setUser, setToken, setLoading, signOut, loadStoredToken } = useAuthStore();

  useEffect(() => {
    if (isSupabaseMode) {
      initSupabase();
    } else {
      initDigitalOcean();
    }
  }, []);

  // ── Supabase mode ────────────────────────────────────────────────────────────
  async function initSupabase() {
    const { data: { session } } = await supabase.auth.getSession();
    if (session) {
      await setToken(session.access_token);
      await fetchProfile();
    } else {
      setLoading(false);
    }

    const { data: { subscription } } = supabase.auth.onAuthStateChange(async (_event, session) => {
      if (session) {
        await setToken(session.access_token);
        await fetchProfile();
      } else {
        await signOut();
        setLoading(false);
      }
    });

    return () => subscription.unsubscribe();
  }

  // ── DigitalOcean mode ────────────────────────────────────────────────────────
  async function initDigitalOcean() {
    const stored = await loadStoredToken();
    if (stored) {
      await fetchProfile();
    } else {
      setLoading(false);
    }
  }

  // ── Shared ───────────────────────────────────────────────────────────────────
  async function fetchProfile() {
    try {
      const res = await api.get<{ user: UserRow }>('/api/users/me');
      setUser(res.user);
    } catch {
      // session may be expired; clear it
      await signOut();
    } finally {
      setLoading(false);
    }
  }

  async function logout() {
    if (isSupabaseMode) {
      await supabase.auth.signOut();
    } else {
      try { await api.post('/api/auth/logout', {}); } catch { /* best effort */ }
    }
    await signOut();
  }

  async function loginWithEmail(email: string, password: string): Promise<void> {
    const res = await api.post<{ token: string; user: UserRow }>('/api/auth/login', { email, password });
    await setToken(res.token);
    setUser(res.user);
  }

  async function signUpWithEmail(email: string, password: string): Promise<void> {
    const res = await api.post<{ token: string; user: UserRow }>('/api/auth/signup', { email, password });
    await setToken(res.token);
    setUser(res.user);
  }

  return { user, token, isLoading, logout, fetchProfile, loginWithEmail, signUpWithEmail };
}

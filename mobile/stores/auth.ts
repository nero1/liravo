import { create } from 'zustand';
import type { UserRow } from '@/types';

interface AuthState {
  user: UserRow | null;
  token: string | null;
  isLoading: boolean;
  setUser: (user: UserRow | null) => void;
  setToken: (token: string | null) => void;
  setLoading: (loading: boolean) => void;
  signOut: () => void;
}

export const useAuthStore = create<AuthState>((set) => ({
  user: null,
  token: null,
  isLoading: true,
  setUser: (user) => set({ user }),
  setToken: (token) => set({ token }),
  setLoading: (isLoading) => set({ isLoading }),
  signOut: () => set({ user: null, token: null }),
}));

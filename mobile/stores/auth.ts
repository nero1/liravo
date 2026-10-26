import { create } from 'zustand';
import * as SecureStore from 'expo-secure-store';
import type { UserRow } from '@/types';

const TOKEN_KEY = 'liravo_auth_token';

interface AuthState {
  user: UserRow | null;
  token: string | null;
  isLoading: boolean;
  mfaChallenge:string|null;
  setMfaChallenge:(challenge:string|null)=>void;
  setUser: (user: UserRow | null) => void;
  setToken: (token: string | null) => Promise<void>;
  setLoading: (loading: boolean) => void;
  signOut: () => Promise<void>;
  loadStoredToken: () => Promise<string | null>;
}

export const useAuthStore = create<AuthState>((set) => ({
  user: null,
  token: null,
  isLoading: true,
  mfaChallenge:null,
  setMfaChallenge:(mfaChallenge)=>set({mfaChallenge}),
  setUser: (user) => set({ user }),
  setToken: async (token) => {
    if (token) {
      await SecureStore.setItemAsync(TOKEN_KEY, token);
    } else {
      await SecureStore.deleteItemAsync(TOKEN_KEY);
    }
    set({ token });
  },
  setLoading: (isLoading) => set({ isLoading }),
  signOut: async () => {
    await SecureStore.deleteItemAsync(TOKEN_KEY);
    set({user:null,token:null,mfaChallenge:null});
  },
  loadStoredToken: async () => {
    const stored = await SecureStore.getItemAsync(TOKEN_KEY);
    if (stored) set({ token: stored });
    return stored;
  },
}));

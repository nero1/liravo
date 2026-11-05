import { create } from 'zustand';
import * as SecureStore from 'expo-secure-store';
import type { UserRow } from '@/types';
import { queryClient } from '@/lib/queryClient';

const TOKEN_KEY = 'liravo_auth_token';
let revision=0;
let persistence=Promise.resolve();
function persist(token:string|null){
  persistence=persistence.catch(()=>{}).then(()=>token?SecureStore.setItemAsync(TOKEN_KEY,token):SecureStore.deleteItemAsync(TOKEN_KEY));
  return persistence;
}

interface AuthState {
  user: UserRow | null;
  token: string | null;
  isLoading: boolean;
  mfaChallenge:string|null;
  authUnavailable:boolean;
  authRetry:number;
  setAuthUnavailable:(unavailable:boolean)=>void;
  retryAuthentication:()=>void;
  setMfaChallenge:(challenge:string|null)=>void;
  setUser: (user: UserRow | null) => void;
  setToken: (token: string | null) => Promise<void>;
  setLoading: (loading: boolean) => void;
  signOut: () => Promise<void>;
  loadStoredToken: () => Promise<string | null>;
}

export const useAuthStore = create<AuthState>((set,get) => ({
  user: null,
  token: null,
  isLoading: true,
  mfaChallenge:null,
  authUnavailable:false,
  authRetry:0,
  setAuthUnavailable:(authUnavailable)=>set({authUnavailable}),
  retryAuthentication:()=>set({authRetry:get().authRetry+1,authUnavailable:false,isLoading:true}),
  setMfaChallenge:(mfaChallenge)=>set({mfaChallenge}),
  setUser: (user) => {
    if(get().user?.id!==user?.id)queryClient.clear();
    set({user});
  },
  setToken: async (token) => {
    revision++;
    if(get().token!==token){queryClient.clear();set({token,user:null,mfaChallenge:null});}
    await persist(token);
  },
  setLoading: (isLoading) => set({ isLoading }),
  signOut: async () => {
    revision++;
    queryClient.clear();
    set({user:null,token:null,mfaChallenge:null,isLoading:false,authUnavailable:false});
    await persist(null);
  },
  loadStoredToken: async () => {
    const started=revision;
    const stored=await SecureStore.getItemAsync(TOKEN_KEY);
    if(started!==revision)return get().token;
    if(stored)set({token:stored});
    return stored;
  },
}));

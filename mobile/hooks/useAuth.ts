import { useEffect } from 'react';
import { isSupabaseMode, supabase } from '@/lib/supabase';
import { useAuthStore } from '@/stores/auth';
import { api } from '@/lib/api';
import type { UserRow } from '@/types';

export function useAuth(initialize=false) {
  const { user, token, isLoading, setUser, setToken, setLoading, signOut, loadStoredToken, mfaChallenge, setMfaChallenge } = useAuthStore();

  useEffect(()=>{
    if(!initialize)return;
    let active=true;
    const authenticate=async(accessToken:string)=>{
      await setToken(accessToken);
      try{
        const result=await api.post<{mfaRequired?:boolean;challengeToken?:string;user?:UserRow}>('/api/auth/session',{});
        if(!active)return;
        if(result.mfaRequired){setUser(null);setMfaChallenge(result.challengeToken!);}else{setMfaChallenge(null);setUser(result.user??null);}
      }catch{if(active)await signOut();}finally{if(active)setLoading(false);}
    };
    if(isSupabaseMode){
      void supabase.auth.getSession().then(({data:{session}})=>{if(active){if(session)void authenticate(session.access_token);else setLoading(false);}});
      const {data:{subscription}}=supabase.auth.onAuthStateChange((_event,session)=>{queueMicrotask(()=>{if(active){if(session)void authenticate(session.access_token);else{void signOut();setLoading(false);}}});});
      return()=>{active=false;subscription.unsubscribe();};
    }
    void initDigitalOcean();
    return()=>{active=false;};
  },[initialize]);

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
    try{await api.post('/api/auth/logout',{});}catch{}
    if(isSupabaseMode)await supabase.auth.signOut();
    await signOut();
  }

  type LoginResult={token?:string;user?:UserRow;mfaRequired?:boolean;challengeToken?:string};
  async function acceptLogin(result:LoginResult){
    if(result.mfaRequired){setMfaChallenge(result.challengeToken!);setUser(null);return;}
    await setToken(result.token!);setUser(result.user!);setMfaChallenge(null);
  }
  async function loginWithEmail(email:string,password:string){await acceptLogin(await api.post<LoginResult>('/api/auth/login',{email,password}));}
  async function signUpWithEmail(email:string,password:string){await acceptLogin(await api.post<LoginResult>('/api/auth/signup',{email,password}));}
  async function loginWithGoogleToken(idToken:string){await acceptLogin(await api.post<LoginResult>('/api/auth/google',{idToken}));}
  async function verifySecondFactor(value:string,recovery:boolean){
    const result=await api.post<LoginResult>('/api/auth/2fa/verify',{challengeToken:useAuthStore.getState().mfaChallenge,...(recovery?{recoveryCode:value}:{code:value})});
    if(result.token)await setToken(result.token);
    setUser(result.user!);setMfaChallenge(null);
  }
  return {user,token,isLoading,mfaChallenge,logout,fetchProfile,loginWithEmail,signUpWithEmail,loginWithGoogleToken,verifySecondFactor};
}

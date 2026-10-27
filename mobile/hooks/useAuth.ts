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
    const current=(accessToken:string)=>active&&useAuthStore.getState().token===accessToken;
    const authenticate=async(accessToken:string)=>{
      setLoading(true);
      await setToken(accessToken);
      if(!current(accessToken))return;
      try{
        const result=await api.post<{mfaRequired?:boolean;challengeToken?:string;user?:UserRow}>('/api/auth/session',{});
        if(!current(accessToken))return;
        if(result.mfaRequired){setUser(null);setMfaChallenge(result.challengeToken!);}else{setMfaChallenge(null);setUser(result.user??null);}
      }catch{if(current(accessToken))await signOut();}finally{if(current(accessToken))setLoading(false);}
    };
    if(isSupabaseMode){
      const {data:{subscription}}=supabase.auth.onAuthStateChange((_event,session)=>{queueMicrotask(()=>{if(active){if(session)void authenticate(session.access_token);else void signOut();}});});
      return()=>{active=false;subscription.unsubscribe();};
    }
    void (async()=>{
      const stored=await loadStoredToken();
      if(!active)return;
      if(!stored){setLoading(false);return;}
      try{
        const result=await api.get<{user:UserRow}>('/api/users/me');
        if(current(stored))setUser(result.user);
      }catch{if(current(stored))await signOut();}finally{if(current(stored))setLoading(false);}
    })();
    return()=>{active=false;};
  },[initialize,loadStoredToken,setLoading,setMfaChallenge,setToken,setUser,signOut]);

  // ── Shared ───────────────────────────────────────────────────────────────────
  async function fetchProfile() {
    const started=useAuthStore.getState().token;
    try {
      const res = await api.get<{ user: UserRow }>('/api/users/me');
      if(useAuthStore.getState().token===started)setUser(res.user);
    } catch {
      // session may be expired; clear it
      if(useAuthStore.getState().token===started)await signOut();
    } finally {
      if(useAuthStore.getState().token===started)setLoading(false);
    }
  }

  async function logout() {
    try{await api.post('/api/auth/logout',{});}catch{}
    if(isSupabaseMode)await supabase.auth.signOut();
    await signOut();
  }

  type LoginResult={token?:string;user?:UserRow;mfaRequired?:boolean;challengeToken?:string};
  async function acceptLogin(result:LoginResult){
    if(result.mfaRequired){await setToken(null);setMfaChallenge(result.challengeToken!);setUser(null);return;}
    await setToken(result.token!);setUser(result.user!);setMfaChallenge(null);
  }
  async function loginWithEmail(email:string,password:string){await acceptLogin(await api.post<LoginResult>('/api/auth/login',{email,password}));}
  async function signUpWithEmail(email:string,password:string){await acceptLogin(await api.post<LoginResult>('/api/auth/signup',{email,password}));}
  async function loginWithGoogleToken(idToken:string){await acceptLogin(await api.post<LoginResult>('/api/auth/google',{idToken}));}
  async function verifySecondFactor(value:string,recovery:boolean){
    const challengeToken=useAuthStore.getState().mfaChallenge;
    const result=await api.post<LoginResult>('/api/auth/2fa/verify',{challengeToken,...(recovery?{recoveryCode:value}:{code:value})});
    if(useAuthStore.getState().mfaChallenge!==challengeToken)return;
    if(result.token)await setToken(result.token);
    setUser(result.user!);setMfaChallenge(null);
  }
  return {user,token,isLoading,mfaChallenge,logout,fetchProfile,loginWithEmail,signUpWithEmail,loginWithGoogleToken,verifySecondFactor};
}

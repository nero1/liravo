import {unregisterDevicePush} from '@/lib/device-push';
import {useTranslations} from '@/hooks/useTranslations';
import { useEffect,useRef } from 'react';
import { isSupabaseMode, supabase } from '@/lib/supabase';
import { useAuthStore } from '@/stores/auth';
import { api } from '@/lib/api';
import type { UserRow } from '@/types';

export function useAuth(initialize=false) {
  const {locale}=useTranslations('auth'),localeRef=useRef(locale);localeRef.current=locale;
  const { user, token, isLoading, setUser, setToken, setLoading, signOut, loadStoredToken, mfaChallenge, setMfaChallenge,authUnavailable,authRetry,setAuthUnavailable,retryAuthentication } = useAuthStore();
  const rejectSession=async(error:unknown)=>{if([401,403].includes(Number((error as {status?:number})?.status)))await signOut();else setAuthUnavailable(true);};

  useEffect(()=>{
    if(!initialize)return;
    let active=true;
    const current=(accessToken:string)=>active&&useAuthStore.getState().token===accessToken;
    const authenticate=async(accessToken:string)=>{
      setLoading(true);
      try{
        await setToken(accessToken);if(!current(accessToken))return;
        const result=await api.post<{mfaRequired?:boolean;challengeToken?:string;user?:UserRow}>('/api/auth/session',{}, {'X-Liravo-Preferred-Locale':localeRef.current});
        if(!current(accessToken))return;
        if(result.mfaRequired){setUser(null);setMfaChallenge(result.challengeToken!);}else{setMfaChallenge(null);setUser(result.user??null);}setAuthUnavailable(false);
      }catch(error){if(current(accessToken))await rejectSession(error);}finally{if(current(accessToken))setLoading(false);}
    };
    if(isSupabaseMode){
      const {data:{subscription}}=supabase.auth.onAuthStateChange((event,session)=>{queueMicrotask(()=>{
        if(!active)return;if(session){void authenticate(session.access_token);return;}
        if(event==='SIGNED_OUT'){void signOut();return;}
        const started=useAuthStore.getState().token;
        void(async()=>{try{const result=await supabase.auth.getSession();if(!active||useAuthStore.getState().token!==started)return;if(result.error)throw result.error;if(result.data.session)await authenticate(result.data.session.access_token);else await signOut();}catch(error){if(active&&useAuthStore.getState().token===started){await rejectSession(error);setLoading(false);}}})();
      });});
      return()=>{active=false;subscription.unsubscribe();};
    }
    void (async()=>{
      let stored:string|null=null;
      try{
        stored=await loadStoredToken();if(!active)return;if(!stored){setLoading(false);return;}
        const result=await api.get<{user:UserRow}>('/api/users/me');
        if(current(stored)){setUser(result.user);setAuthUnavailable(false);}
      }catch(error){if(active&&(!stored||current(stored)))await rejectSession(error);}finally{if(active&&(!stored||current(stored)))setLoading(false);}
    })();
    return()=>{active=false;};
  },[initialize,loadStoredToken,setLoading,setMfaChallenge,setToken,setUser,signOut,authRetry,setAuthUnavailable]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Shared ───────────────────────────────────────────────────────────────────
  async function fetchProfile() {
    const started=useAuthStore.getState().token;
    try {
      const res = await api.get<{ user: UserRow }>('/api/users/me');
      if(useAuthStore.getState().token===started){setUser(res.user);setAuthUnavailable(false);}
    } catch(error) {
      if(useAuthStore.getState().token===started)await rejectSession(error);
    } finally {
      if(useAuthStore.getState().token===started)setLoading(false);
    }
  }

  async function logout() {
    const started=useAuthStore.getState().token;
    try{await api.post('/api/auth/logout',{});}catch{}
    if(useAuthStore.getState().token!==started)return;
    try{await unregisterDevicePush();}catch{}
    if(useAuthStore.getState().token!==started)return;
    try{if(isSupabaseMode)await supabase.auth.signOut({scope:'local'});}finally{if(useAuthStore.getState().token===started)await signOut();}
  }

  type LoginResult={token?:string;user?:UserRow;mfaRequired?:boolean;challengeToken?:string};
  async function acceptLogin(result:LoginResult){
    setAuthUnavailable(false);
    if(result.mfaRequired){await setToken(null);setMfaChallenge(result.challengeToken!);setUser(null);return;}
    await setToken(result.token!);setUser(result.user!);setMfaChallenge(null);
  }
  async function loginWithEmail(email:string,password:string,hcaptchaToken?:string){await acceptLogin(await api.post<LoginResult>('/api/auth/login',{email,password,hcaptchaToken}));}
  async function signUpWithEmail(email:string,password:string,hcaptchaToken?:string){await acceptLogin(await api.post<LoginResult>('/api/auth/signup',{email,password,hcaptchaToken},{'X-Liravo-Preferred-Locale':locale}));}
  async function loginWithGoogleToken(idToken:string){await acceptLogin(await api.post<LoginResult>('/api/auth/google',{idToken},{'X-Liravo-Preferred-Locale':locale}));}
  async function verifySecondFactor(value:string,recovery:boolean){
    const challengeToken=useAuthStore.getState().mfaChallenge;
    const result=await api.post<LoginResult>('/api/auth/2fa/verify',{challengeToken,...(recovery?{recoveryCode:value}:{code:value})});
    if(useAuthStore.getState().mfaChallenge!==challengeToken)return;
    if(result.token)await setToken(result.token);
    setUser(result.user!);setMfaChallenge(null);
  }
  return {user,token,isLoading,mfaChallenge,authUnavailable,retryAuthentication,logout,fetchProfile,loginWithEmail,signUpWithEmail,loginWithGoogleToken,verifySecondFactor};
}

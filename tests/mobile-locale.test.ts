import {expect,it,vi} from 'vitest';
import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';
import ts from 'typescript';

function preferences(storage:{getItem:ReturnType<typeof vi.fn>;setItem:ReturnType<typeof vi.fn>}){
  let state:any;
  const exports:any={};
  const code=ts.transpileModule(readFileSync('mobile/stores/preferences.ts','utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS}}).outputText;
  runInNewContext(code,{exports,require:(name:string)=>{
    if(name==='zustand')return {create:(initialize:any)=>{state=initialize((patch:object)=>Object.assign(state,patch),()=>state);return {getState:()=>state};}};
    if(name==='@react-native-async-storage/async-storage')return {default:storage};
    throw Error('Unexpected dependency '+name);
  }});
  return exports.usePreferences.getState();
}
it('does not replace an authenticated preference with a late stored locale',async()=>{
  let release:(value:string)=>void=()=>{};
  const storage={getItem:vi.fn(()=>new Promise<string>(resolve=>{release=resolve;})),setItem:vi.fn(async()=>{})},store=preferences(storage);
  const hydration=store.hydrate();
  await store.setLocale('fr');release('de');await hydration;
  expect(store.locale).toBe('fr');expect(storage.setItem).toHaveBeenLastCalledWith('liravo_locale','fr');
});
it('serializes locale persistence and rolls back only the failed current choice',async()=>{
  let release:()=>void=()=>{};
  const writes:string[]=[],storage={getItem:vi.fn(async()=>null),setItem:vi.fn((_:string,value:string)=>{writes.push(value);return value==='fr'?new Promise<void>(resolve=>{release=resolve;}):Promise.resolve();})},store=preferences(storage);
  await store.hydrate();const first=store.setLocale('fr'),second=store.setLocale('de');await Promise.resolve();await Promise.resolve();
  expect(writes).toEqual(['fr']);release();await Promise.all([first,second]);expect(writes).toEqual(['fr','de']);expect(store.locale).toBe('de');
  storage.setItem.mockRejectedValueOnce(Error('Storage unavailable'));await expect(store.setLocale('en')).rejects.toThrow('Storage unavailable');expect(store.locale).toBe('de');
});
it('ignores unsupported persisted locales and tolerates unavailable preference storage',async()=>{
  for(const getItem of [vi.fn(async()=> 'es'),vi.fn(async()=>{throw Error('Storage unavailable');})]){
    const store=preferences({getItem,setItem:vi.fn(async()=>{})});await store.hydrate();expect(store.locale).toBeNull();expect(store.hydrated).toBe(true);
  }
});

it('sends the selected native language with new email and Google accounts',async()=>{
  const state:any={user:null,token:null,setUser:(user:unknown)=>{state.user=user;},setToken:async(token:string)=>{state.token=token;},setMfaChallenge:()=>{},setAuthUnavailable:()=>{}};
  const post=vi.fn(async()=>({token:'fixture-token',user:{id:'reader',preferred_locale:'fr'}})),store=Object.assign(()=>state,{getState:()=>state}),exports:any={};
  const code=ts.transpileModule(readFileSync('mobile/hooks/useAuth.ts','utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS}}).outputText;
  runInNewContext(code,{exports,require:(name:string)=>{
    if(name==='react')return {useEffect:()=>{},useRef:(current:unknown)=>({current})};
    if(name==='@/lib/device-push')return {unregisterDevicePush:async()=>{}};
    if(name==='@/hooks/useTranslations')return {useTranslations:()=>({locale:'fr'})};
    if(name==='@/stores/auth')return {useAuthStore:store};
    if(name==='@/lib/supabase')return {isSupabaseMode:false,supabase:{}};
    if(name==='@/lib/api')return {api:{post}};throw Error(name);
  }});
  const auth=exports.useAuth();await auth.signUpWithEmail('reader@example.test','fixture-password','fixture-proof');await auth.loginWithGoogleToken('fixture-id-token');
  expect(post).toHaveBeenCalledWith('/api/auth/signup',{email:'reader@example.test',password:'fixture-password',hcaptchaToken:'fixture-proof'},{'X-Liravo-Preferred-Locale':'fr'});
  expect(post).toHaveBeenCalledWith('/api/auth/google',{idToken:'fixture-id-token'},{'X-Liravo-Preferred-Locale':'fr'});expect(state.user.preferred_locale).toBe('fr');
});

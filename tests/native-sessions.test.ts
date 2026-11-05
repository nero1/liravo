import {expect,it,vi} from 'vitest';
import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';
import ts from 'typescript';

function authFixture(provider=false){
 const effects:Array<()=>void|(()=>void)>=[],get=vi.fn(),post=vi.fn(),unregister=vi.fn().mockResolvedValue(undefined);
 const state:any={token:'valid-session',user:null,isLoading:true,mfaChallenge:null,authUnavailable:false,authRetry:0,setAuthUnavailable:(value:boolean)=>{state.authUnavailable=value;},retryAuthentication:()=>{state.authRetry++;state.isLoading=true;state.authUnavailable=false;},setLoading:(value:boolean)=>{state.isLoading=value;},setUser:(user:unknown)=>{state.user=user;},setToken:async(token:string)=>{state.token=token;},setMfaChallenge:()=>{},loadStoredToken:async()=>state.token,signOut:vi.fn(async()=>{state.token=null;state.user=null;state.isLoading=false;})};
 const session=vi.fn(),events:{callback?:(event:string,session:unknown)=>void}={};
 const store=Object.assign(()=>state,{getState:()=>state}),exports:any={};
 const code=ts.transpileModule(readFileSync('mobile/hooks/useAuth.ts','utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS}}).outputText;
 runInNewContext(code,{exports,queueMicrotask,require:(name:string)=>{
  if(name==='react')return {useEffect:(fn:()=>void)=>effects.push(fn),useRef:(current:unknown)=>({current})};
  if(name==='@/hooks/useTranslations')return {useTranslations:()=>({locale:'en'})};
  if(name==='@/stores/auth')return {useAuthStore:store};
  if(name==='@/lib/supabase')return {isSupabaseMode:provider,supabase:{auth:{getSession:session,onAuthStateChange:(callback:typeof events.callback)=>{events.callback=callback;return {data:{subscription:{unsubscribe:()=>{}}}};}}}};
  if(name==='@/lib/api')return {api:{get,post}};
  if(name==='@/lib/device-push')return {unregisterDevicePush:unregister};
  throw Error(name);
 }});
 const mount=()=>{const auth=exports.useAuth(true),teardown=effects.at(-1)!();return {auth,cleanup:typeof teardown==='function'?teardown:undefined};};
 return {state,get,post,unregister,mount,session,events};
}
it('preserves a valid native session through an outage and recovers using the retry action',async()=>{
 const f=authFixture();f.get.mockRejectedValueOnce(Object.assign(Error('Unavailable'),{status:503}));let mounted=f.mount();
 await vi.waitFor(()=>expect(f.state.isLoading).toBe(false));expect(f.state.token).toBe('valid-session');expect(f.state.authUnavailable).toBe(true);expect(f.state.signOut).not.toHaveBeenCalled();
 mounted.cleanup?.();mounted.auth.retryAuthentication();f.get.mockResolvedValueOnce({user:{id:'reader'}});mounted=f.mount();await vi.waitFor(()=>expect(f.state.user).toEqual({id:'reader'}));expect(f.state.authUnavailable).toBe(false);expect(f.state.token).toBe('valid-session');mounted.cleanup?.();
});
it('clears only confirmed invalid sessions and ignores a previous account’s late profile failure',async()=>{
 const denied=authFixture();denied.get.mockRejectedValueOnce(Object.assign(Error('Revoked'),{status:401}));const first=denied.mount();await vi.waitFor(()=>expect(denied.state.signOut).toHaveBeenCalledOnce());expect(denied.state.token).toBeNull();first.cleanup?.();
 const changed=authFixture();let reject!:(error:Error)=>void;changed.get.mockReturnValueOnce(new Promise((_resolve,failed)=>reject=failed));const second=changed.mount();await vi.waitFor(()=>expect(changed.get).toHaveBeenCalledOnce());changed.state.token='new-account';reject(Error('Previous failure'));await Promise.resolve();await Promise.resolve();expect(changed.state.signOut).not.toHaveBeenCalled();expect(changed.state.token).toBe('new-account');second.cleanup?.();
});
it('revokes the device before clearing local authentication and leaves a new account intact',async()=>{
 const f=authFixture();f.post.mockResolvedValueOnce({ok:true});const {auth}=f.mount();await auth.logout();expect(f.post).toHaveBeenCalledWith('/api/auth/logout',{});expect(f.unregister).toHaveBeenCalledOnce();expect(f.state.signOut).toHaveBeenCalledOnce();
 const changed=authFixture();let release!:(value:unknown)=>void;changed.post.mockReturnValueOnce(new Promise(resolve=>release=resolve));const pending=changed.mount().auth.logout();changed.state.token='another-account';release({ok:true});await pending;expect(changed.unregister).not.toHaveBeenCalled();expect(changed.state.signOut).not.toHaveBeenCalled();
});

it('opens owned cold-start and live notifications once and rejects external destinations',async()=>{
 const links:any={};runInNewContext(ts.transpileModule(readFileSync('mobile/lib/notification-links.ts','utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS}}).outputText,{exports:links});
 for(const value of['https://attacker.test','//attacker.test','/book/%2Fsecret','/unknown','/notifications\\evil'])expect(links.notificationPath(value)).toBeNull();
 const id='00000000-0000-4000-8000-000000000105',state:any={token:'session',user:{id:'reader'}},router={push:vi.fn()},remove=vi.fn(),post=vi.fn().mockResolvedValue({ok:true,actorId:'reader'}),effects:Array<()=>()=>void>=[],exports:any={};
 let listener!:(response:unknown)=>void;
 const response=(identifier:string,url:string,recipientId='reader')=>({notification:{request:{identifier,content:{data:{url,recipientId}}}}});
 const notifications={setNotificationHandler:()=>{},addNotificationReceivedListener:()=>({remove}),addNotificationResponseReceivedListener:(fn:typeof listener)=>{listener=fn;return {remove};},getLastNotificationResponseAsync:async()=>response('cold','/book/'+id),clearLastNotificationResponseAsync:vi.fn().mockResolvedValue(undefined)};
 const store=Object.assign(()=>state,{getState:()=>state});
 runInNewContext(ts.transpileModule(readFileSync('mobile/hooks/usePushNotifications.ts','utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS}}).outputText,{exports,setTimeout,clearTimeout,require:(name:string)=>{
  if(name==='react')return {useEffect:(fn:()=>()=>void)=>effects.push(fn),useRef:(current:unknown)=>({current})};
  if(name==='react-native')return {Platform:{OS:'android'}};
  if(name==='expo-notifications')return notifications;
  if(name==='expo-router')return {useRouter:()=>router};
  if(name==='@/stores/auth')return {useAuthStore:store};
  if(name==='@/lib/api')return {api:{post}};
  if(name==='@/lib/notification-links')return links;
  if(name==='@/lib/device-push')return {registerDevicePush:async()=>'ExpoPushToken[fixture]'};
  throw Error(name);
 }});
 exports.usePushNotifications();const cleanup=effects[0]();await vi.waitFor(()=>expect(router.push).toHaveBeenCalledWith('/book/'+id));
 listener(response('cold','/book/'+id));listener(response('external','https://attacker.test'));listener(response('foreign','/notifications','previous-account'));expect(router.push).toHaveBeenCalledOnce();
 listener(response('live','/notifications'));expect(router.push).toHaveBeenLastCalledWith('/(tabs)/notifications');state.token='new-session';listener(response('stale','/book/'+id));expect(router.push).toHaveBeenCalledTimes(2);cleanup();expect(remove).toHaveBeenCalledTimes(2);
});
it('serializes native unregistration before a new registration and configures Android before requesting permission',async()=>{
 const order:string[]=[],exports:any={};let release!:()=>void;const gate=new Promise<void>(resolve=>release=resolve);
 runInNewContext(ts.transpileModule(readFileSync('mobile/lib/device-push.ts','utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS}}).outputText,{exports,setTimeout,clearTimeout,require:(name:string)=>{
  if(name==='react-native')return {Platform:{OS:'android'}};
  if(name==='expo-device')return {isDevice:true};
  if(name==='expo-constants')return {default:{expoConfig:{extra:{eas:{projectId:'fixture'}}}}};
  if(name==='expo-notifications')return {AndroidImportance:{MAX:5},unregisterForNotificationsAsync:async()=>{order.push('unregister');await gate;},setNotificationChannelAsync:async()=>{order.push('channel');},getPermissionsAsync:async()=>{order.push('permission');return {status:'granted'};},getExpoPushTokenAsync:async()=>{order.push('register');return {data:'ExpoPushToken[fixture]'};}};
  throw Error(name);
 }});
 const old=exports.unregisterDevicePush(),next=exports.registerDevicePush();await vi.waitFor(()=>expect(order).toEqual(['unregister']));release();await old;expect(await next).toBe('ExpoPushToken[fixture]');expect(order).toEqual(['unregister','channel','permission','register']);
});

it('preserves credentials when initial provider-session recovery is unavailable',async()=>{
 const f=authFixture(true);f.session.mockResolvedValue({data:{session:null},error:{status:503}});const mounted=f.mount();f.events.callback!('INITIAL_SESSION',null);await vi.waitFor(()=>expect(f.state.authUnavailable).toBe(true));expect(f.state.token).toBe('valid-session');expect(f.state.signOut).not.toHaveBeenCalled();expect(f.state.isLoading).toBe(false);mounted.cleanup?.();
});

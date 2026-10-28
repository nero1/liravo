import {beforeEach,expect,it,vi} from 'vitest';
import {NextRequest} from 'next/server';
import {PATCH} from '@/app/api/users/profile/route';
import {GET as profile} from '@/app/api/users/me/route';
import {getCurrentUser} from '@/lib/auth/getCurrentUser';
import {NOTIFICATION_KEYS,readNotificationPreferences} from '@/lib/notification-preferences';
import {PUBLIC_USER_COLUMNS,OWN_USER_COLUMNS} from '@/lib/user-profile';
import en from '../messages/en.json';
import fr from '../messages/fr.json';
import de from '../messages/de.json';
const state=vi.hoisted(()=>({user:{} as Record<string,unknown>,patches:[] as Record<string,unknown>[],filters:[] as unknown[],unavailable:false}));
vi.mock('@/lib/auth/getCurrentUser',()=>({getCurrentUser:vi.fn()}));
vi.mock('@/lib/rate-limit',()=>({checkRouteRateLimit:async()=>true,checkCriticalRateLimit:async()=>({allowed:true})}));
vi.mock('@/lib/supabase/server',()=>({createServiceClient:()=>{const chain={update:(value:Record<string,unknown>)=>{state.patches.push(value);Object.assign(state.user,value);return chain;},eq:(field:string,value:unknown)=>{state.filters.push([field,value]);return chain;},is:()=>chain,select:()=>chain,maybeSingle:async()=>({data:state.unavailable?null:state.user,error:state.unavailable?{code:'08006'}:null})};return {from:()=>chain};}}));
const actor='00000000-0000-4000-8000-000000000069';
const request=(body:unknown,headers:Record<string,string>={})=>new NextRequest('https://app.test/api/users/profile',{method:'PATCH',headers:{'Content-Type':'application/json',...headers},body:JSON.stringify(body)});
beforeEach(()=>{state.user={id:actor,pin_hash:'private-fixture',...Object.fromEntries(NOTIFICATION_KEYS.map(key=>[key,true]))};state.patches=[];state.filters=[];state.unavailable=false;vi.mocked(getCurrentUser).mockResolvedValue({id:actor} as never);});
it('loads actual saved preferences only in the owned profile and includes complete translated control labels',async()=>{
  state.user.notify_follows=false;const data=await(await profile()).json();expect(readNotificationPreferences(data.user).notify_follows).toBe(false);expect(data.user).not.toHaveProperty('pin_hash');
  for(const key of NOTIFICATION_KEYS){expect(OWN_USER_COLUMNS.split(',')).toContain(key);expect(PUBLIC_USER_COLUMNS.split(',')).not.toContain(key);for(const catalog of [en,fr,de])expect(catalog.notificationPreferences.flags[key]).toBeTruthy();}
});
it('updates only the authenticated account and returns the committed flags without private auth fields',async()=>{
  const response=await PATCH(request({notify_follows:false,notify_replies:false},{'X-Liravo-Actor':actor})),data=await response.json();expect(response.status).toBe(200);expect(data).toMatchObject({ok:true,user:{id:actor,notify_follows:false,notify_replies:false,notify_likes:true}});expect(data.user).not.toHaveProperty('pin_hash');expect(state.filters).toContainEqual(['id',actor]);expect(state.patches).toEqual([{notify_follows:false,notify_replies:false}]);
});
it('rejects privilege fields, non-boolean flags, empty writes and stale actors before mutation',async()=>{
  for(const body of [{is_admin:true},{notify_follows:'false'},{}])expect((await PATCH(request(body))).status).toBe(422);
  expect((await PATCH(request({notify_follows:false},{'X-Liravo-Actor':'00000000-0000-4000-8000-000000000001'}))).status).toBe(409);expect(state.patches).toHaveLength(0);
});
it('requires authentication and never acknowledges a failed database update',async()=>{
  vi.mocked(getCurrentUser).mockResolvedValue(null);expect((await PATCH(request({notify_follows:false}))).status).toBe(401);vi.mocked(getCurrentUser).mockResolvedValue({id:actor} as never);state.unavailable=true;expect((await PATCH(request({notify_follows:false}))).status).toBe(503);
});

import {afterEach,beforeEach,expect,it,vi} from 'vitest';
import {sendPushToUser} from '@/lib/push-notifications';
import {NOTIFICATION_KEYS} from '@/lib/notification-preferences';
import {createTranslator} from 'next-intl';
import fr from '../messages/fr.json';
const state=vi.hoisted(()=>({user:{} as Record<string,unknown>,error:null as unknown,subscriptions:[] as unknown[]}));
vi.mock('@/lib/supabase/server',()=>({createServiceClient:()=>({from:(table:string)=>{const result=()=>({data:table==='users'?state.user:state.subscriptions,error:state.error});const chain={select:()=>chain,eq:()=>chain,single:async()=>result(),then:(resolve:any,reject:any)=>Promise.resolve(result()).then(resolve,reject)};return chain;}})}));
const transport=vi.fn();
beforeEach(()=>{state.user={push_token:'ExponentPushToken[isolated]',preferred_locale:'fr',is_banned:false,deleted_at:null,...Object.fromEntries(NOTIFICATION_KEYS.map(key=>[key,true]))};state.error=null;state.subscriptions=[];transport.mockReset();transport.mockResolvedValue(Response.json({data:{status:'ok'}}));vi.stubGlobal('fetch',transport);});
afterEach(()=>{vi.unstubAllGlobals();});
it('honors the current opt-out before sending any push',async()=>{
  state.user.notify_follows=false;await sendPushToUser('reader',{title:'English title',body:'English body',notificationType:'follow',messageKey:'follow',messageValues:{name:'Alice'}});expect(transport).not.toHaveBeenCalled();
});
it('formats stored facts in the recipient locale and retains the destination',async()=>{
  await sendPushToUser('reader',{title:'English title',body:'English body',notificationType:'follow',messageKey:'follow',messageValues:{name:'Alice'},url:'/notifications'});
  const payload=JSON.parse(transport.mock.calls[0][1].body),t=createTranslator({locale:'fr',messages:fr});expect(payload.title).toBe(t('notificationMessages.titles.follow'));expect(payload.body).toBe(t('notificationMessages.follow',{name:'Alice'}));expect(payload.data.url).toBe('/notifications');
});
it('does not treat HTTP 200 with an Expo error receipt as successful delivery',async()=>{
  transport.mockResolvedValue(Response.json({data:{status:'error',details:{error:'DeviceNotRegistered'}}}));await expect(sendPushToUser('reader',{title:'Test',body:'Test',notificationType:'tip',messageKey:'tip'})).rejects.toThrow('Push delivery unavailable');
});
it('does not send when account state or preferences cannot be verified',async()=>{
  for(const patch of [{is_banned:true},{deleted_at:'2026-10-28'}]){Object.assign(state.user,patch);await sendPushToUser('reader',{title:'Test',body:'Test'});}expect(transport).not.toHaveBeenCalled();state.user.is_banned=false;state.user.deleted_at=null;state.error={code:'08006'};await sendPushToUser('reader',{title:'Test',body:'Test'});expect(transport).not.toHaveBeenCalled();
});

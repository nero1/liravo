import {beforeEach,expect,it,vi} from 'vitest';
import {createECDH,randomBytes} from 'node:crypto';
import {POST,DELETE} from '@/app/api/users/web-push/route';
import {POST as registerNative} from '@/app/api/users/push-token/route';
import {trustedPushEndpoint,publicPushAddress,pushAgent} from '@/lib/push-subscriptions';
import {drainOutbox} from '@/lib/outbox-worker';
const state=vi.hoisted(()=>({rpc:vi.fn(),lookup:vi.fn(),send:vi.fn(),update:vi.fn(),eq:vi.fn(),query:{} as any}));
vi.mock('node:dns',()=>({lookup:state.lookup}));
vi.mock('@/lib/auth/getCurrentUser',()=>({getCurrentUser:async()=>({id:'00000000-0000-4000-8000-000000000105'})}));
vi.mock('@/lib/auth/second-factor',()=>({currentFactorSessionHash:async()=>'a'.repeat(64)}));
vi.mock('@/lib/supabase/server',()=>({createServiceClient:()=>({rpc:state.rpc,from:()=>state.query})}));
vi.mock('@/lib/rate-limit',()=>({checkRouteRateLimit:async()=>true}));
vi.mock('@/services/badges',()=>({checkAndAwardBadges:async()=>{}}));
vi.mock('@/lib/metrics',()=>({recordMetric:()=>{}}));
vi.mock('@/lib/push-notifications',()=>({sendPushToUser:state.send}));
const actor='00000000-0000-4000-8000-000000000105',id='00000000-0000-4000-8000-000000000106';
const ecdh=createECDH('prime256v1');ecdh.generateKeys();const sub={endpoint:'https://fcm.googleapis.com/fcm/send/fixture',keys:{p256dh:ecdh.getPublicKey('base64url'),auth:randomBytes(16).toString('base64url')}};
const request=(body:unknown)=>new Request('https://app.test/api/users/web-push',{method:'POST',body:JSON.stringify(body)});
beforeEach(()=>{vi.clearAllMocks();state.rpc.mockResolvedValue({data:id,error:null});const query={update:state.update,eq:state.eq,select:()=>query,maybeSingle:async()=>({data:{id},error:null}),then:(resolve:any)=>Promise.resolve({error:null}).then(resolve)};state.query=query;state.update.mockReturnValue(query);state.eq.mockReturnValue(query);state.send.mockResolvedValue(undefined);});
it('rejects private targets, credentials, alternate ports and invalid subscription keys',async()=>{
 for(const endpoint of['https://127.0.0.1/private','https://[::1]/','https://2130706433/','http://fcm.googleapis.com/x','https://fcm.googleapis.com.attacker.test/x','https://user@fcm.googleapis.com/x','https://fcm.googleapis.com:8443/x']){expect(trustedPushEndpoint(endpoint)).toBe(false);expect((await POST(request({...sub,endpoint}))).status).toBe(400);}
 expect((await POST(request({...sub,keys:{p256dh:'bad',auth:'bad'}}))).status).toBe(400);expect(state.rpc).not.toHaveBeenCalled();
});
it('rejects unsafe DNS answers at the connection lookup and permits public addresses',async()=>{
 for(const address of['127.0.0.1','10.0.0.1','169.254.169.254','172.16.0.1','192.168.1.1','::1','::ffff:127.0.0.1','fd00::1','fec0::1','64:ff9b::7f00:1','2002:7f00:1::1'])expect(publicPushAddress(address)).toBe(false);expect(publicPushAddress('8.8.8.8')).toBe(true);expect(publicPushAddress('2606:4700:4700::1111')).toBe(true);
 state.lookup.mockImplementation((_host:unknown,_options:unknown,callback:any)=>callback(null,[{address:'127.0.0.1',family:4}]));
 const result=await new Promise<Error|null>(resolve=>pushAgent.options.lookup!('fcm.googleapis.com',{all:true},error=>resolve(error)));expect(result?.message).toBe('Unsafe push address');
});
it('binds registration to the verified actor/session and never acknowledges failed writes',async()=>{
 expect((await POST(request(sub))).status).toBe(200);expect(state.rpc).toHaveBeenLastCalledWith('register_push_subscription',expect.objectContaining({p_user:actor,p_session:'a'.repeat(64),p_channel:'web'}));
 state.rpc.mockResolvedValue({data:null,error:{code:'08006'}});expect((await POST(request(sub))).status).toBe(503);expect((await DELETE(request({endpoint:sub.endpoint}))).status).toBe(503);expect((await DELETE(new Request('https://app.test/push',{method:'DELETE',body:'{'}))).status).toBe(400);
 expect((await registerNative(request({token:'arbitrary',platform:'android'}))).status).toBe(400);expect((await registerNative(request({token:'ExpoPushToken[fixture]',platform:'android'}))).status).toBe(503);
});
it('commits parent effects without performing an untracked external delivery',async()=>{
 state.rpc.mockImplementation(async(name:string)=>({data:name==='claim_outbox_events'?[{id,event_type:'push_notification',payload:{userId:actor},attempts:1}]:true,error:null}));
 expect(await drainOutbox(1)).toMatchObject({processed:1,failed:0});expect(state.send).not.toHaveBeenCalled();expect(state.rpc).toHaveBeenCalledWith('process_outbox_event_atomic',{p_event_id:id});
});
it('waits for provider and receipt acknowledgements before completing a claimed delivery',async()=>{
 state.rpc.mockImplementation(async(name:string)=>({data:name==='claim_outbox_events'?[{id,event_type:'deliver_push',payload:{userId:actor},attempts:2}]:true,error:null}));
 let release!:()=>void;const gate=new Promise<void>(resolve=>release=resolve);
 state.send.mockImplementation(async(_user:unknown,_payload:unknown,receipt:any)=>{await gate;await receipt.ack(id);});
 const pending=drainOutbox(1);await vi.waitFor(()=>expect(state.send).toHaveBeenCalledOnce());expect(state.update).not.toHaveBeenCalled();release();expect(await pending).toMatchObject({processed:1,failed:0});expect(state.rpc).toHaveBeenCalledWith('ack_push_delivery',{p_event:id,p_attempt:2,p_subscription:id});expect(state.update).toHaveBeenCalledWith(expect.objectContaining({status:'processed'}));expect(state.eq).toHaveBeenCalledWith('attempts',2);
});
it('keeps provider failures retryable without repeating committed parent effects',async()=>{
 state.rpc.mockResolvedValue({data:[{id,event_type:'deliver_push',payload:{userId:actor},attempts:3}],error:null});state.send.mockRejectedValue(Error('Provider unavailable'));
 expect(await drainOutbox(1)).toMatchObject({processed:0,failed:1});expect(state.update).toHaveBeenCalledWith(expect.objectContaining({status:'pending',last_error:'Provider unavailable'}));expect(state.rpc).not.toHaveBeenCalledWith('process_outbox_event_atomic',expect.anything());
});

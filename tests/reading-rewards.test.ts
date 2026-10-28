import {beforeEach,expect,it,vi} from 'vitest';
import {NextRequest} from 'next/server';
import {POST as claim} from '@/app/api/xp/route';
import {POST as membership} from '@/app/api/shelf-books/toggle/route';
import {createServiceClient} from '@/lib/supabase/server';
import {getCurrentUser} from '@/lib/auth/getCurrentUser';
import {checkRouteRateLimit} from '@/lib/rate-limit';

vi.mock('@/lib/supabase/server',()=>({createServiceClient:vi.fn()}));
vi.mock('@/lib/auth/getCurrentUser',()=>({getCurrentUser:vi.fn()}));
vi.mock('@/lib/rate-limit',()=>({checkRouteRateLimit:vi.fn()}));
vi.mock('@/lib/redis',()=>({getRedisClient:()=>{throw new Error('Isolated unavailable cache');},REDIS_KEYS:{book:(id:string)=>'book:'+id}}));
const user='00000000-0000-4000-8000-000000000001',book='00000000-0000-4000-8000-000000000002',shelf='00000000-0000-4000-8000-000000000003',rpc=vi.fn();
const request=(body:unknown,headers:Record<string,string>={})=>new NextRequest('https://app.test/api/shelf-books/toggle',{method:'POST',headers:{'Content-Type':'application/json','Idempotency-Key':'reading-reward-fixture',...headers},body:JSON.stringify(body)});
beforeEach(()=>{vi.resetAllMocks();vi.mocked(getCurrentUser).mockResolvedValue({id:user} as never);vi.mocked(checkRouteRateLimit).mockResolvedValue(true);vi.mocked(createServiceClient).mockReturnValue({rpc} as never);rpc.mockResolvedValue({data:{xp:53,awarded:3},error:null});});
it('claims the server-dated daily business event without accepting caller-supplied reward values',async()=>{
  const response=await claim(request({action:'daily_login'}));expect(response.status).toBe(200);expect(await response.json()).toEqual({xp_awarded:3,new_total:53});expect(rpc).toHaveBeenCalledWith('claim_reading_reward',{p_user_id:user,p_action:'daily_login',p_book_id:null});
  rpc.mockClear();for(const body of [{action:'add_book',bookId:book},{action:'daily_login',amount:500},{action:'daily_login',bookId:book},{action:'finish_book'}])expect((await claim(request(body))).status).toBe(400);expect(rpc).not.toHaveBeenCalled();
});
it('delegates completion proof to the database and preserves zero-award replays',async()=>{
  rpc.mockResolvedValueOnce({data:{xp:50,awarded:0},error:null});const response=await claim(request({action:'finish_book',bookId:book}));expect(await response.json()).toEqual({xp_awarded:0,new_total:50});expect(rpc).toHaveBeenCalledWith('claim_reading_reward',{p_user_id:user,p_action:'finish_book',p_book_id:book});
  rpc.mockResolvedValueOnce({data:null,error:{code:'08006'}});expect((await claim(request({action:'daily_login'}))).status).toBe(503);
});
it('returns the atomic membership/reward receipt even when cache invalidation fails',async()=>{
  const result={ok:true,defaultType:'have_read',xp_awarded:50,new_total:50};rpc.mockResolvedValueOnce({data:result,error:null});const response=await membership(request({shelfId:shelf,bookId:book,action:'add'}));expect(response.status).toBe(200);expect(await response.json()).toEqual(result);expect(rpc).toHaveBeenCalledWith('apply_shelf_membership_intent',{p_user_id:user,p_shelf_id:shelf,p_book_id:book,p_add:true,p_key:'reading-reward-fixture'});
});
it('rejects switched actors, missing intent keys and injected ownership before mutation',async()=>{
  const body={shelfId:shelf,bookId:book,action:'add'};
  expect((await membership(request(body,{'X-Liravo-Actor':book}))).status).toBe(409);expect((await membership(request(body,{'Idempotency-Key':''}))).status).toBe(400);expect((await membership(request({...body,userId:book}))).status).toBe(400);expect(rpc).not.toHaveBeenCalled();
  vi.mocked(getCurrentUser).mockResolvedValue(null);expect((await claim(request({action:'daily_login'}))).status).toBe(401);
});
it('reports conflicting intents, unavailable targets and malformed receipts without success',async()=>{
  for(const [code,status] of [['P1001',409],['P1003',403],['P1005',404],['08006',503]] as const){rpc.mockResolvedValueOnce({data:null,error:{code}});expect((await membership(request({shelfId:shelf,bookId:book,action:'add'}))).status).toBe(status);}
  rpc.mockResolvedValueOnce({data:{ok:true,defaultType:'have_read'},error:null});expect((await membership(request({shelfId:shelf,bookId:book,action:'add'}))).status).toBe(503);
});

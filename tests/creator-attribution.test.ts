import {beforeEach,expect,it,vi} from 'vitest';
import {GET as analytics} from '@/app/api/creator/analytics/route';
import {GET as leaderboard} from '@/app/api/creator/leaderboard/route';
import {POST as reaction} from '@/app/api/books/[id]/reactions/route';
import {getCurrentUser} from '@/lib/auth/getCurrentUser';
import {createServiceClient} from '@/lib/supabase/server';
import {checkRouteRateLimit} from '@/lib/rate-limit';

vi.mock('@/lib/auth/getCurrentUser',()=>({getCurrentUser:vi.fn()}));
vi.mock('@/lib/supabase/server',()=>({createServiceClient:vi.fn()}));
vi.mock('@/lib/rate-limit',()=>({checkRouteRateLimit:vi.fn()}));
const actor='00000000-0000-4000-8000-000000000001',book='00000000-0000-4000-8000-000000000002',review='00000000-0000-4000-8000-000000000003';
const stats={follower_count:4,review_count:2,want_to_read_triggered:1,tips_received:5.25,tips_received_by_currency:{USD:5.25,NGN:900,EUR:0}},rpc=vi.fn();
const request=(body:unknown,headers:Record<string,string>={})=>new Request('https://app.test/api/books/'+book+'/reactions',{method:'POST',headers:{'Content-Type':'application/json','Idempotency-Key':'fixture-conversion-key',...headers},body:JSON.stringify(body)});
beforeEach(()=>{vi.resetAllMocks();vi.mocked(getCurrentUser).mockResolvedValue({id:actor} as never);vi.mocked(checkRouteRateLimit).mockResolvedValue(true);vi.mocked(createServiceClient).mockReturnValue({rpc} as never);rpc.mockResolvedValue({data:stats,error:null});});
it('returns the owned canonical analytics contract with numeric, separate currencies',async()=>{
  const response=await analytics();expect(response.status).toBe(200);expect(await response.json()).toEqual(stats);expect(rpc).toHaveBeenCalledWith('read_creator_analytics',{p_user_id:actor});
  vi.mocked(getCurrentUser).mockResolvedValue(null);expect((await analytics()).status).toBe(401);expect(rpc).toHaveBeenCalledTimes(1);
});
it('reports database or malformed statistics failures instead of fabricated zeroes',async()=>{
  for(const result of [{data:stats,error:{code:'08006'}},{data:{...stats,tips_received:'02.503.25'},error:null},{data:{leaderboard:[]},error:null}]){rpc.mockResolvedValueOnce(result);expect((await analytics()).status).toBe(503);}
});
it('returns current weekly ranking data and does not fall back to arbitrary users',async()=>{
  const result={week_start:'2026-10-26T00:00:00+00:00',leaderboard:[{user_id:actor,username:'fixture',display_name:'Fixture',avatar_url:null,user_types:['creator'],is_verified_author:false,want_to_read_score:3,total_score:3}]};
  rpc.mockResolvedValueOnce({data:result,error:null});expect(await(await leaderboard()).json()).toEqual(result);expect(rpc).toHaveBeenCalledWith('read_creator_leaderboard');
  rpc.mockResolvedValueOnce({data:null,error:{code:'08006'}});expect((await leaderboard()).status).toBe(503);
});
it('passes reviewed source and desired shelf state through the atomic interaction contract',async()=>{
  rpc.mockResolvedValueOnce({data:{reacted:true},error:null});const response=await reaction(request({reviewId:review,active:true}),{params:Promise.resolve({id:book})});expect(response.status).toBe(200);expect(await response.json()).toEqual({reacted:true});
  expect(rpc).toHaveBeenCalledWith('apply_book_interaction',{p_user_id:actor,p_book_id:book,p_action:'reaction',p_key:'fixture-conversion-key',p_review_id:review,p_value:true});
});
it('rejects malformed sources, account switches and unbounded bodies before mutation',async()=>{
  for(const [body,headers,status] of [[{reviewId:'foreign-id'},{},400],[{reviewId:review,active:'true'},{},400],[{reviewId:review,reviewerId:actor},{},400],[{active:true},{'X-Liravo-Actor':review},409],[{padding:'x'.repeat(2100)},{},413]] as [unknown,Record<string,string>,number][])expect((await reaction(request(body,headers),{params:Promise.resolve({id:book})})).status).toBe(status);
  expect(rpc).not.toHaveBeenCalled();
});
it('retains legacy toggle requests and reports intent conflicts or unavailable reviews',async()=>{
  rpc.mockResolvedValueOnce({data:{reacted:true},error:null});expect((await reaction(new Request('https://app.test/reaction',{method:'POST',headers:{'Idempotency-Key':'legacy-conversion-key'}}),{params:Promise.resolve({id:book})})).status).toBe(200);
  expect(rpc).toHaveBeenCalledWith('apply_book_interaction',expect.objectContaining({p_review_id:null,p_value:null}));
  for(const [code,status] of [['P1001',409],['P1003',404],['08006',503]] as const){rpc.mockResolvedValueOnce({data:null,error:{code}});expect((await reaction(request({active:true}),{params:Promise.resolve({id:book})})).status).toBe(status);}
});

import {beforeEach,expect,it,vi} from 'vitest';
import {GET,PATCH} from '@/app/api/moderation/reviews/route';
const actor='00000000-0000-4000-8000-000000000105',id='00000000-0000-4000-8000-000000000106';
const state=vi.hoisted(()=>({rpc:vi.fn(),allowed:true}));
vi.mock('@/lib/auth/getCurrentUser',()=>({getCurrentUser:async()=>({id:'00000000-0000-4000-8000-000000000105'})}));
vi.mock('@/lib/supabase/server',()=>({createServiceClient:()=>({rpc:state.rpc})}));
vi.mock('@/lib/rate-limit',()=>({checkRouteRateLimit:async()=>state.allowed}));
beforeEach(()=>{state.allowed=true;state.rpc.mockReset();});
const request=(body:unknown,owner=actor)=>new Request('https://app.test/api/moderation/reviews',{method:'PATCH',headers:{'X-Liravo-Actor':owner},body:JSON.stringify(body)});
it('keeps access checks in SQL and fails closed on unreadable queue receipts',async()=>{
 state.rpc.mockResolvedValue({data:null,error:{code:'P1003'}});expect((await GET(new Request('https://app.test/api/moderation/reviews'))).status).toBe(403);
 state.rpc.mockResolvedValue({data:[{}],error:null});expect((await GET(new Request('https://app.test/api/moderation/reviews'))).status).toBe(503);
 state.rpc.mockResolvedValue({data:[],error:null});expect(await(await GET(new Request('https://app.test/api/moderation/reviews'))).json()).toMatchObject({actorId:actor,reviews:[],nextCursor:null});
});
it('checks the actor and bounded decision before accepting only the matching database receipt',async()=>{
 expect((await PATCH(request({reviewId:id,status:'published'},id))).status).toBe(409);expect(state.rpc).not.toHaveBeenCalled();
 state.rpc.mockResolvedValue({data:{reviewId:id,userId:actor,status:'published',changed:true},error:null});expect((await PATCH(request({reviewId:id,status:'published'}))).status).toBe(200);
 state.rpc.mockResolvedValue({data:{ok:true},error:null});expect((await PATCH(request({reviewId:id,status:'published'}))).status).toBe(503);
 state.allowed=false;expect((await PATCH(request({reviewId:id,status:'removed'}))).status).toBe(429);
});

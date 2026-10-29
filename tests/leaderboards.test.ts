import {beforeEach,expect,it,vi} from 'vitest';
import {GET} from '@/app/api/leaderboards/route';
import {GET as snapshot} from '@/app/api/cron/leaderboard-snapshot/route';
import {getCurrentUser} from '@/lib/auth/getCurrentUser';
import {createServiceClient} from '@/lib/supabase/server';
vi.mock('@/lib/auth/getCurrentUser',()=>({getCurrentUser:vi.fn()}));
vi.mock('@/lib/supabase/server',()=>({createServiceClient:vi.fn()}));
vi.mock('@/lib/cron',()=>({cron:(_name:string,task:unknown)=>task}));
vi.mock('@/lib/redis',()=>({getRedisClient:()=>({set:save})}));
const rpc=vi.fn(),save=vi.fn(),actor='00000000-0000-4000-8000-000000001001';
const page={leaderboard:[{id:actor,xp:20,lifetime_xp:50000}],periodStart:'2026-10-26T00:00:00Z',periodEnd:'2026-11-02T00:00:00Z',type:'global',period:'weekly',country:null};
beforeEach(()=>{vi.clearAllMocks();vi.mocked(getCurrentUser).mockResolvedValue({id:actor,email:'fixture@example.test'});vi.mocked(createServiceClient).mockReturnValue({rpc} as never);rpc.mockResolvedValue({data:page,error:null});save.mockResolvedValue('OK');});
it('uses authoritative period snapshots and lifetime level thresholds without locale-scoped cache reuse',async()=>{
  const response=await GET(new Request('https://app.test/api/leaderboards?type=national&period=monthly&locale=de') as never);expect(response.status).toBe(200);expect(await response.json()).toMatchObject({actorId:actor,leaderboard:[{xp:20,lifetime_xp:50000,level_min:50000,level_title:'Legend of the Shelf'}]});expect(rpc).toHaveBeenCalledWith('leaderboard_snapshot',{p_user:actor,p_type:'national',p_period:'monthly',p_country:'DE',p_limit:50});expect(save).not.toHaveBeenCalled();
});
it('rejects invalid queries and database failures without fabricated empty rankings',async()=>{
  for(const query of ['period=yearly','type=unknown','locale=es'])expect((await GET(new Request('https://app.test/api/leaderboards?'+query) as never)).status).toBe(400);expect(rpc).not.toHaveBeenCalled();rpc.mockResolvedValue({data:null,error:{code:'XX000'}});expect((await GET(new Request('https://app.test/api/leaderboards') as never)).status).toBe(503);vi.mocked(getCurrentUser).mockResolvedValue(null);expect((await GET(new Request('https://app.test/api/leaderboards') as never)).status).toBe(401);
});
it('archives the shared UTC weekly snapshot without overwriting live leaderboard caches',async()=>{
  const response=await snapshot(new Request('https://app.test/api/cron/leaderboard-snapshot'));expect(response.status).toBe(200);expect(await response.json()).toEqual({snapshot:'2026-10-26',usersSnapshotted:1});expect(rpc).toHaveBeenCalledWith('leaderboard_snapshot',{p_user:null,p_type:'global',p_period:'weekly',p_country:null,p_limit:100});expect(save).toHaveBeenCalledExactlyOnceWith('leaderboard:snapshot:weekly:2026-10-26',expect.any(String),{ex:604800});
});

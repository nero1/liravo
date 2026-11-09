import { beforeEach,expect,it,vi } from 'vitest';
import { callAI } from '@/lib/ai-client';
import { hasPremiumAccess } from '@/lib/premium-access';
import { createServiceClient } from '@/lib/supabase/server';
import { withRedisLock } from '@/lib/locks';
import { generateTasteProfile,readTasteProfile,generateWritingPlan,WritingTasksSchema,writingWeekStart } from '@/services/ai-profiles';
vi.mock('@/lib/ai-client',()=>({callAI:vi.fn()}));
vi.mock('@/lib/premium-access',()=>({hasPremiumAccess:vi.fn()}));
vi.mock('@/lib/supabase/server',()=>({createServiceClient:vi.fn()}));
vi.mock('@/lib/locks',async original=>({...await original<typeof import('@/lib/locks')>(),withRedisLock:vi.fn()}));
let source:Record<string,unknown>,stored:Record<string,unknown>|null;
const rpc=vi.fn(),maybeSingle=vi.fn();
beforeEach(()=>{
  vi.clearAllMocks();
  source={locale:'fr',books:[{genres:['Fiction'],review:{moods:['Hopeful']}},{genres:['History']},{genres:['Fiction']}]};stored=null;
  maybeSingle.mockImplementation(async()=>({data:stored?{...stored,timestamp:stored.generated_at??stored.created_at,value:stored.profile_data??stored.tasks}:null,error:null}));
  const query={select:()=>query,eq:()=>query,maybeSingle};
  rpc.mockImplementation(async(name:string,args:Record<string,unknown>)=>{
    if(name==='taste_profile_input'||name==='writing_plan_input')return {data:source,error:null};
    stored={source_hash:args.p_hash,policy_version:args.p_policy,generated_at:new Date().toISOString(),created_at:new Date().toISOString(),profile_data:args.p_profile,tasks:args.p_tasks};
    return {data:stored?{...stored,timestamp:stored.generated_at??stored.created_at,value:stored.profile_data??stored.tasks}:null,error:null};
  });
  vi.mocked(createServiceClient).mockReturnValue({from:()=>query,rpc} as unknown as ReturnType<typeof createServiceClient>);
  vi.mocked(hasPremiumAccess).mockResolvedValue(true);
  vi.mocked(withRedisLock).mockImplementation(async(_key,_ttl,task)=>task());
  vi.mocked(callAI).mockResolvedValue({text:JSON.stringify({summary:'Vous aimez les récits riches en personnages.'}),provider:'deepseek'});
});
it('requires paid access before loading private data or contacting a model',async()=>{
  vi.mocked(hasPremiumAccess).mockResolvedValue(false);
  await expect(generateTasteProfile('reader')).rejects.toMatchObject({status:403});
  expect(rpc).not.toHaveBeenCalled();expect(callAI).not.toHaveBeenCalled();
});
it('commits only validated prose, derives preferences from actual reading, and reuses a fresh policy-scoped profile',async()=>{
  const result=await generateTasteProfile('reader');
  expect(result.profile).toMatchObject({top_genres:['Fiction','History'],mood_preferences:['Hopeful']});
  expect(callAI).toHaveBeenCalledWith(JSON.stringify(source),expect.objectContaining({system:expect.stringContaining('untrusted data')}));
  expect(vi.mocked(callAI).mock.calls[0][1]?.system).toContain('French');
  expect((await generateTasteProfile('reader')).cached).toBe(true);
  expect(callAI).toHaveBeenCalledOnce();
  source={...source,locale:'de'};
  expect((await readTasteProfile('reader')).profile).toBeNull();
});
it('rejects unsafe, malformed and fabricated successful responses before any save',async()=>{
  for(const text of ['{}','not JSON','{"summary":"<script>bad</script>"}','{"summary":"Visit https://evil.test"}','{"summary":"Fine","extra":"unexpected"}']){
    vi.mocked(callAI).mockResolvedValueOnce({text,provider:'deepseek'});
    await expect(generateTasteProfile('reader')).rejects.toThrow();
  }
  expect(rpc.mock.calls.some(([name])=>name==='save_taste_profile')).toBe(false);
});
it('ignores legacy or unsafe cached profiles and refuses insufficient history without a provider call',async()=>{
  stored={profile_text:'Legacy unvalidated text',generated_at:new Date().toISOString()};
  expect((await readTasteProfile('reader')).profile).toBeNull();
  source={locale:'en',books:[]};
  await expect(generateTasteProfile('reader')).rejects.toMatchObject({code:'insufficientHistory',status:422});
  expect(callAI).not.toHaveBeenCalled();
});
it('uses Monday UTC weeks and validates the ordered seven-day writing contract',async()=>{
  expect(writingWeekStart(new Date('2026-10-25T23:59:59Z'))).toBe('2026-10-19');
  expect(writingWeekStart(new Date('2026-10-26T00:00:00Z'))).toBe('2026-10-26');
  source={locale:'en',genres:['Fantasy'],challenges:[],user_types:['newbie_writer']};
  const tasks=['Monday','Tuesday','Wednesday','Thursday','Friday','Saturday','Sunday'].map(day=>({day,task:'Write a character scene.',goal:'300 words'}));
  expect(WritingTasksSchema.safeParse([...tasks].reverse()).success).toBe(false);
  vi.mocked(callAI).mockResolvedValueOnce({text:JSON.stringify(tasks),provider:'gemini'});
  const result=await generateWritingPlan('writer');expect(result.plan.tasks).toHaveLength(7);
  expect(rpc).toHaveBeenCalledWith('save_writing_plan',expect.objectContaining({p_user_id:'writer',p_week:writingWeekStart()}));
});

vi.mock('@/lib/auth/getCurrentUser',()=>({getCurrentUser:vi.fn()}));
vi.mock('@/lib/rate-limit',()=>({checkRouteRateLimit:vi.fn(async()=>true)}));
import { getCurrentUser } from '@/lib/auth/getCurrentUser';
import { GET,POST } from '@/app/api/ai/taste-profile/route';
it('returns JSON to native generation and derives ownership from the authenticated session',async()=>{
  vi.mocked(getCurrentUser).mockResolvedValue({id:'reader',email:'reader@example.test'});
  const response=await POST(new Request('https://app.test/api/ai/taste-profile',{method:'POST',headers:{'Content-Type':'application/json'},body:'{"userId":"foreign"}'}));
  expect(response.status).toBe(200);expect(response.headers.get('location')).toBeNull();
  expect((await response.json()).profile.summary).toContain('Vous aimez');
  for(const [,args]of rpc.mock.calls)expect(args.p_user_id).toBe('reader');
});
it('denies anonymous reads and redirects failed browser forms without fabricating a profile',async()=>{
  vi.mocked(getCurrentUser).mockResolvedValue(null);
  expect((await GET()).status).toBe(401);expect(rpc).not.toHaveBeenCalled();
  vi.mocked(getCurrentUser).mockResolvedValue({id:'reader',email:'reader@example.test'});
  vi.mocked(callAI).mockRejectedValueOnce(new Error('Provider unavailable'));
  const response=await POST(new Request('https://app.test/api/ai/taste-profile',{method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded'},body:''}));
  expect(response.status).toBe(303);expect(response.headers.get('location')).toBe('/taste-profile?error=unavailable');
  expect(stored).toBeNull();
});

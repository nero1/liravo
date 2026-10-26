import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { POST } from '@/app/api/cron/generate-prompts/route';
import { getRedisClient } from '@/lib/redis';
import { createServiceClient } from '@/lib/supabase/server';
import { fetchWithRetry } from '@/lib/retry';

vi.mock('@/lib/cron',()=>({cron:(_name:string,task:(request:Request)=>Promise<Response>)=>task}));
vi.mock('@/lib/redis',()=>({getRedisClient:vi.fn()}));
vi.mock('@/lib/supabase/server',()=>({createServiceClient:vi.fn()}));
vi.mock('@/lib/retry',()=>({fetchWithRetry:vi.fn()}));
const cache=new Map<string,string>();
const published=new Set<string>();
const rpc=vi.fn();
const request=()=>new Request('https://app.test/api/cron/generate-prompts',{method:'POST'});
const modelText=(count=7)=>Array.from({length:count},(_,index)=>`${index+1}. [Adventure] Write about an unexpected journey on day ${index+1}.`).join('\n');
beforeEach(()=>{
  vi.clearAllMocks();cache.clear();published.clear();
  vi.useFakeTimers();vi.setSystemTime(new Date('2026-10-26T12:00:00Z'));
  vi.stubEnv('DEEPSEEK_API_KEY','isolated-test-key');vi.stubEnv('GEMINI_API_KEY','isolated-test-key');
  vi.mocked(getRedisClient).mockReturnValue({get:async(key:string)=>cache.get(key)??null,set:async(key:string,value:string)=>{cache.set(key,value);}} as unknown as ReturnType<typeof getRedisClient>);
  vi.mocked(createServiceClient).mockReturnValue({rpc} as unknown as ReturnType<typeof createServiceClient>);
  vi.mocked(fetchWithRetry).mockResolvedValue(new Response(JSON.stringify({choices:[{message:{content:modelText()}}]})));
  rpc.mockImplementation(async(_name:string,args:{p_date:string})=>{const created=!published.has(args.p_date);published.add(args.p_date);return {data:{created},error:null};});
});
afterEach(()=>{vi.useRealTimers();vi.unstubAllEnvs();});

it('publishes today and resumes a partial database failure from validated cache without losing days',async()=>{
  const publish=rpc.getMockImplementation()!;
  let first=true;
  rpc.mockImplementation(async(name:string,args:{p_date:string})=>{
    if(first && args.p_date==='2026-10-28') {first=false;return {data:null,error:{message:'temporary failure'}};}
    return publish(name,args);
  });
  const initial=await POST(request());
  expect(initial.status).toBe(503);
  expect(await initial.json()).toMatchObject({success:false,errors:['2026-10-28']});
  const retry=await POST(request());
  expect(retry.status).toBe(200);
  expect(await retry.json()).toMatchObject({success:true,inserted:['2026-10-28'],errors:[],skipped:expect.any(Array)});
  expect(published.size).toBe(7);expect(published.has('2026-10-26')).toBe(true);
  expect(fetchWithRetry).toHaveBeenCalledTimes(1);
});

it('rejects incomplete model output rather than claiming generic replacement prompts were generated',async()=>{
  vi.mocked(fetchWithRetry).mockResolvedValue(new Response(JSON.stringify({choices:[{message:{content:modelText(6)}}]})));
  expect((await POST(request())).status).toBe(502);
  expect(rpc).not.toHaveBeenCalled();expect(cache.size).toBe(0);
});

it('falls back to Gemini on provider failure and skips already committed dates safely',async()=>{
  vi.mocked(fetchWithRetry).mockRejectedValueOnce(new Error('provider offline')).mockResolvedValueOnce(new Response(JSON.stringify({candidates:[{content:{parts:[{text:modelText()}]}}]})));
  expect((await POST(request())).status).toBe(200);
  const retry=await POST(request());
  expect(await retry.json()).toMatchObject({inserted:[],skipped:expect.any(Array),success:true});
  expect(fetchWithRetry).toHaveBeenCalledTimes(2);
  expect(vi.mocked(fetchWithRetry).mock.calls[1][0]).toContain('generativelanguage.googleapis.com');
});

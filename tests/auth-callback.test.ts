import { beforeEach, expect, it, vi } from 'vitest';
import { GET } from '@/app/api/auth/callback/route';
import { createClient, createServiceClient } from '@/lib/supabase/server';
import { getCurrentUser } from '@/lib/auth/getCurrentUser';
import { checkAndAwardBadges } from '@/services/badges';

vi.mock('@/lib/supabase/server',()=>({createClient:vi.fn(),createServiceClient:vi.fn()}));
vi.mock('@/lib/auth/getCurrentUser',()=>({getCurrentUser:vi.fn()}));
vi.mock('@/lib/db/provider',()=>({isDirectPostgres:()=>false}));
vi.mock('@/services/badges',()=>({checkAndAwardBadges:vi.fn()}));
vi.mock('@/lib/metrics',()=>({recordMetric:vi.fn()}));
beforeEach(()=>vi.clearAllMocks());

it('keeps successful OAuth return locations on the application origin',async()=>{
  const client={auth:{exchangeCodeForSession:vi.fn().mockResolvedValue({error:null})},from:()=>({select:()=>({eq:()=>({single:async()=>({data:{onboarding_complete:true}})})})})};
  vi.mocked(createClient).mockReturnValue(client as unknown as ReturnType<typeof createClient>);
  vi.mocked(getCurrentUser).mockResolvedValue({id:'signed-in-user',email:''});
  for(const next of ['@evil.test','.evil.test','//evil.test','https://evil.test']) {
    const response=await GET(new Request(`https://app.test/api/auth/callback?code=test-code&next=${encodeURIComponent(next)}`));
    expect(response.headers.get('location')).toBe('https://app.test/');
  }
  const valid=await GET(new Request('https://app.test/api/auth/callback?code=test-code&next=%2Ffeed'));
  expect(valid.headers.get('location')).toBe('https://app.test/feed');
  const missing=await GET(new Request('https://app.test/api/auth/callback'));
  expect(missing.status).toBe(307);
});

it('attributes referrals only through the service transaction for the authenticated user',async()=>{
  const client={auth:{exchangeCodeForSession:vi.fn().mockResolvedValue({error:null})},from:()=>({select:()=>({eq:()=>({single:async()=>({data:{onboarding_complete:true}})})})})};
  vi.mocked(createClient).mockReturnValue(client as unknown as ReturnType<typeof createClient>);
  vi.mocked(getCurrentUser).mockResolvedValue({id:'signed-in-user',email:''});
  const rpc=vi.fn().mockResolvedValue({data:'verified-referrer',error:null});
  vi.mocked(createServiceClient).mockReturnValue({rpc} as unknown as ReturnType<typeof createServiceClient>);
  await GET(new Request('https://app.test/api/auth/callback?code=test-code&ref=123456789012&user_id=forged-user'));
  expect(rpc).toHaveBeenCalledWith('attribute_referral_atomic',{p_user_id:'signed-in-user',p_code:'123456789012'});
  expect(checkAndAwardBadges).toHaveBeenCalledWith('verified-referrer','referral');
});

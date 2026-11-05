import { beforeEach, expect, it, vi } from 'vitest';
import { GET } from '@/app/api/auth/callback/route';
import { createClient, createServiceClient } from '@/lib/supabase/server';
import { getCurrentUser } from '@/lib/auth/getCurrentUser';
import { checkAndAwardBadges } from '@/services/badges';

vi.mock('@/lib/supabase/server',()=>({createClient:vi.fn(),createServiceClient:vi.fn()}));
vi.mock('@/lib/auth/getCurrentUser',()=>({getCurrentUser:vi.fn()}));
vi.mock('@/lib/db/provider',()=>({isDirectPostgres:()=>false}));
vi.mock('@/services/badges',()=>({checkAndAwardBadges:vi.fn()}));
vi.mock('@/lib/auth/second-factor',()=>({factorProfile:vi.fn(async()=>({totp_enabled:false}))}));
vi.mock('@/lib/metrics',()=>({recordMetric:vi.fn()}));
beforeEach(()=>{vi.clearAllMocks();vi.mocked(createServiceClient).mockReturnValue({rpc:vi.fn(async()=>({data:'en',error:null}))} as never);});

it('keeps successful OAuth return locations on the application origin',async()=>{
  const client={auth:{getUser:vi.fn().mockResolvedValue({data:{user:{id:'signed-in-user'}}}),exchangeCodeForSession:vi.fn().mockResolvedValue({error:null})},from:()=>({select:()=>({eq:()=>({single:async()=>({data:{onboarding_complete:true}})})})})};
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
  const client={auth:{getUser:vi.fn().mockResolvedValue({data:{user:{id:'signed-in-user'}}}),exchangeCodeForSession:vi.fn().mockResolvedValue({error:null})},from:()=>({select:()=>({eq:()=>({single:async()=>({data:{onboarding_complete:true}})})})})};
  vi.mocked(createClient).mockReturnValue(client as unknown as ReturnType<typeof createClient>);
  vi.mocked(getCurrentUser).mockResolvedValue({id:'signed-in-user',email:''});
  const rpc=vi.fn().mockResolvedValue({data:'verified-referrer',error:null});
  vi.mocked(createServiceClient).mockReturnValue({rpc} as unknown as ReturnType<typeof createServiceClient>);
  await GET(new Request('https://app.test/api/auth/callback?code=test-code&ref=123456789012&user_id=forged-user'));
  expect(rpc).toHaveBeenCalledWith('attribute_referral_atomic',{p_user_id:'signed-in-user',p_code:'123456789012'});
  expect(checkAndAwardBadges).toHaveBeenCalledWith('verified-referrer','referral');
});

it('initializes managed accounts from the selected locale before the OAuth return and fails closed on database failure',async()=>{
  const client={auth:{getUser:async()=>({data:{user:{id:'signed-in-user'}}}),exchangeCodeForSession:async()=>({error:null})},from:()=>({select:()=>({eq:()=>({single:async()=>({data:{onboarding_complete:false}})})})})};
  vi.mocked(createClient).mockReturnValue(client as never);vi.mocked(getCurrentUser).mockResolvedValue({id:'signed-in-user',email:''});
  const rpc=vi.fn().mockResolvedValue({data:'fr',error:null});vi.mocked(createServiceClient).mockReturnValue({rpc} as never);
  const request=()=>new Request('https://app.test/api/auth/callback?code=test-code',{headers:{'X-Liravo-Locale':'fr'}});
  expect((await GET(request())).headers.get('location')).toBe('https://app.test/onboarding');expect(rpc).toHaveBeenCalledWith('initialize_account_locale',{p_user_id:'signed-in-user',p_locale:'fr'});
  rpc.mockResolvedValueOnce({data:null,error:{code:'08006'}});expect((await GET(request())).headers.get('location')).toBe('https://app.test/login?error=auth_callback_failed');
});

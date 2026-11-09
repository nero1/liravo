import { beforeEach, expect, it, vi } from 'vitest';
import { createServiceClient } from '@/lib/supabase/server';
import { getCurrentUser } from '@/lib/auth/getCurrentUser';
import { isAdmin } from '@/lib/moderation';
import { GET } from '@/app/api/earnings/route';
import { PUT } from '@/app/api/earnings/payout-method/route';
import { DELETE } from '@/app/api/earnings/payouts/[id]/route';
import { POST as process } from '@/app/api/admin/payouts/[id]/process/route';

vi.mock('@/lib/supabase/server',()=>({createServiceClient:vi.fn()}));
vi.mock('@/lib/account-pin',async original=>({...await original<typeof import('@/lib/account-pin')>(),readAccountPin:vi.fn(async()=>null),verifyAccountPin:vi.fn(async()=>null)}));
vi.mock('@/lib/auth/getCurrentUser',()=>({getCurrentUser:vi.fn()}));
vi.mock('@/lib/moderation',()=>({isAdmin:vi.fn()}));
vi.mock('@/lib/rate-limit',()=>({checkMoneyRateLimit:async()=>({allowed:true})}));
const user='00000000-0000-4000-8000-000000000001',id='00000000-0000-4000-8000-000000000002';
const rpc=vi.fn(),upsert=vi.fn();const filters:unknown[]=[];
let rows:unknown[]=[];
const builder={select:()=>builder,eq:(key:string,value:unknown)=>{filters.push([key,value]);return builder;},order:()=>builder,limit:()=>builder,or:()=>builder,upsert,then:(resolve:(value:unknown)=>unknown)=>Promise.resolve({data:rows,error:null}).then(resolve)};
const request=(path='')=>new Request('https://app.test/api/earnings'+path);
beforeEach(()=>{
  vi.clearAllMocks();rpc.mockReset();upsert.mockResolvedValue({error:null});rows=[];filters.length=0;
  vi.mocked(getCurrentUser).mockResolvedValue({id:user,email:'reader@example.test'});vi.mocked(isAdmin).mockResolvedValue(true);
  vi.mocked(createServiceClient).mockReturnValue({rpc,from:()=>builder} as unknown as ReturnType<typeof createServiceClient>);
});

it('rejects unauthenticated earnings and invalid currency/cursors before querying balances',async()=>{
  vi.mocked(getCurrentUser).mockResolvedValue(null);expect((await GET(request())).status).toBe(401);
  vi.mocked(getCurrentUser).mockResolvedValue({id:user,email:''});
  expect((await GET(request('?currency=XXX'))).status).toBe(400);expect((await GET(request('?cursor=invalid'))).status).toBe(400);
  expect(rpc).not.toHaveBeenCalled();
});

it('returns unavailable rather than zero earnings on a failed or malformed balance query',async()=>{
  rpc.mockResolvedValue({data:null,error:{code:'08006'}});expect((await GET(request())).status).toBe(503);
  rpc.mockResolvedValue({data:{available:'0'},error:null});expect((await GET(request())).status).toBe(503);
});

it('returns currency-specific earned, reserved and available values with owned payout history',async()=>{
  rpc.mockResolvedValue({data:{currency:'NGN',tips:'900',referrals:'0',events:'0',earned:'900',reserved:'600',paid:'0',available:'300'},error:null});
  const response=await GET(request('?currency=NGN'));
  expect(response.status).toBe(200);expect(await response.json()).toMatchObject({currency:'NGN',available:'300',reserved:'600',payouts:[],nextCursor:null});
  expect(rpc).toHaveBeenCalledWith('creator_balance',{p_user_id:user,p_currency:'NGN'});expect(filters).toContainEqual(['user_id',user]);expect(filters).toContainEqual(['currency','NGN']);
});

it('binds payout destinations to the session and rejects implicit currency conversion',async()=>{
  const save=(currency:string)=>PUT(new Request('https://app.test/api/earnings/payout-method',{method:'PUT',headers:{'Idempotency-Key':'payout-destination-intent'},body:JSON.stringify({provider:'paystack',display_name:'Reader',account_number:'1234567890',bank_code:'058',currency,user_id:id,paystack_recipient_code:'RCP_injected'})}));
  expect((await save('USD')).status).toBe(400);expect(upsert).not.toHaveBeenCalled();
  rpc.mockResolvedValue({data:{saved:true},error:null});
  expect((await save('NGN')).status).toBe(200);
  expect(rpc).toHaveBeenCalledWith('save_payout_destination',expect.objectContaining({p_user_id:user,p_key:'payout-destination-intent',p_pin_hash:null,p_data:{provider:'paystack',display_name:'Reader',account_number:'1234567890',bank_code:'058',currency:'NGN'}}));
  expect(upsert).not.toHaveBeenCalled();
});

it('uses the caller identity for cancellation and reports processing conflicts',async()=>{
  rpc.mockResolvedValue({data:null,error:{code:'P1001'}});
  expect((await DELETE(request(),{params:Promise.resolve({id})})).status).toBe(409);
  expect(rpc).toHaveBeenCalledWith('cancel_payout_request',expect.objectContaining({p_user_id:user,p_payout_id:id}));
});

it('requires admin authorization for manual approval and a matching settlement receipt',async()=>{
  vi.mocked(isAdmin).mockResolvedValue(false);
  expect((await process(new Request('https://app.test',{method:'POST'}),{params:Promise.resolve({id})})).status).toBe(403);expect(rpc).not.toHaveBeenCalled();
  vi.mocked(isAdmin).mockResolvedValue(true);
  rpc.mockResolvedValue({data:{claimed:true,status:'processing',method:'manual'},error:null});
  const approval=await process(new Request('https://app.test',{method:'POST'}),{params:Promise.resolve({id})});
  expect(approval.status).toBe(202);expect(await approval.json()).toMatchObject({processed:false,pending:true});
  rpc.mockResolvedValue({data:null,error:{code:'P1002'}});
  expect((await process(new Request('https://app.test',{method:'POST',body:JSON.stringify({settlementReference:'bank-receipt',amount:'25.00',currency:'USD'})}),{params:Promise.resolve({id})})).status).toBe(409);
  expect(rpc).toHaveBeenCalledWith('settle_payout_request',expect.objectContaining({p_actor_id:user,p_payout_id:id,p_amount:'25.00',p_currency:'USD',p_reference:'bank-receipt'}));
});

it('rejects stale financial actor headers before resolving a destination or balance',async()=>{
  const response=await PUT(new Request('https://app.test/api/earnings/payout-method',{method:'PUT',headers:{'X-Liravo-Actor':id,'Idempotency-Key':'actor-bound-destination'},body:'{}'}));
  expect(response.status).toBe(409);expect((await response.json()).code).toBe('ACCOUNT_CHANGED');expect(rpc).not.toHaveBeenCalled();
});

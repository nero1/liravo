import { afterEach,beforeEach,expect,it,vi } from 'vitest';
import { createTicketCheckout } from '@/lib/payment-providers';
import { normalizeTicket,paymentMetadata } from '@/lib/payment-webhooks';
import { drainPaymentReturns } from '@/lib/payment-returns';
import { POST } from '@/app/api/events/[id]/ticket/route';
import { createServiceClient } from '@/lib/supabase/server';
import { getCurrentUser } from '@/lib/auth/getCurrentUser';
import { requireAdmin } from '@/lib/moderation';
import { POST as reconcileReturn } from '@/app/api/admin/payment-returns/route';

vi.mock('@/lib/supabase/server',()=>({createServiceClient:vi.fn()}));
vi.mock('@/lib/auth/getCurrentUser',()=>({getCurrentUser:vi.fn()}));
vi.mock('@/lib/rate-limit',()=>({checkMoneyRateLimit:async()=>({allowed:true})}));
vi.mock('@/lib/metrics',()=>({recordMetric:vi.fn()}));
vi.mock('@/lib/operational-alerts',()=>({observeOperationalSignal:vi.fn()}));
vi.mock('@/lib/moderation',()=>({requireAdmin:vi.fn()}));
const actor='00000000-0000-4000-8000-000000000001',id='00000000-0000-4000-8000-000000000002',event='00000000-0000-4000-8000-000000000003',claim='00000000-0000-4000-8000-000000000004';
const rpc=vi.fn(),transport=vi.fn();
let ticket:Record<string,unknown>;
beforeEach(()=>{
  vi.clearAllMocks();vi.stubGlobal('fetch',transport);vi.stubEnv('DODOPAYMENTS_API_KEY','isolated-ticket-key');vi.stubEnv('PAYSTACK_SECRET_KEY','isolated-ticket-key');vi.stubEnv('NEXT_PUBLIC_APP_URL','https://app.test');
  ticket={id,user_id:actor,event_id:event,amount_paid:'10.00',currency:'USD',provider:'dodopayments',status:'pending',reserved_until:new Date(Date.now()+1200000).toISOString(),checkout_url:null};
  vi.mocked(getCurrentUser).mockResolvedValue({id:actor,email:'buyer@example.test'});
  vi.mocked(requireAdmin).mockResolvedValue({userId:actor});
  const builder={select:()=>builder,eq:()=>builder,single:async()=>({data:{charged_minor:'1000',refunded_minor:'1000'},error:null})};
  vi.mocked(createServiceClient).mockReturnValue({rpc,from:()=>builder} as unknown as ReturnType<typeof createServiceClient>);
  rpc.mockImplementation(async(name:string)=>({data:name==='reserve_event_ticket'?ticket:name==='claim_payment_returns'?[]:true,error:null}));
  transport.mockImplementation(async(input:unknown)=>String(input).endsWith('/products')?Response.json({product_id:'pdt_ticket',is_recurring:false,price:{type:'one_time_price',price:1000,currency:'USD',pay_what_you_want:false,tax_inclusive:false}}):Response.json({session_id:'cks_ticket',checkout_url:'https://checkout.dodopayments.com/ticket'}));
});
afterEach(()=>{vi.unstubAllGlobals();vi.unstubAllEnvs();});
it('creates a fixed-price ticket product and checkout with immutable account metadata',async()=>{
  expect(await createTicketCheckout(ticket as never,'buyer@example.test')).toEqual({checkoutId:'cks_ticket',url:'https://checkout.dodopayments.com/ticket'});
  const product=JSON.parse(transport.mock.calls[0][1].body),checkout=JSON.parse(transport.mock.calls[1][1].body);
  expect(product.price).toMatchObject({price:1000,pay_what_you_want:false,discount_bps:0,purchasing_power_parity:false,tax_inclusive:false});
  expect(checkout.product_cart).toEqual([{product_id:'pdt_ticket',quantity:1}]);
  expect(checkout.metadata).toEqual({ticket_id:id,user_id:actor,reference:'ticket_'+id});
  expect(transport.mock.calls[1][1].headers['Idempotency-Key']).toBe('ticket_'+id);
});
it('rejects provider pricing changes before opening a ticket checkout',async()=>{
  transport.mockResolvedValueOnce(Response.json({product_id:'pdt_changed',is_recurring:false,price:{type:'one_time_price',price:1000,currency:'USD',pay_what_you_want:true}}));
  await expect(createTicketCheckout(ticket as never,'buyer@example.test')).rejects.toThrow('pricing');expect(transport).toHaveBeenCalledTimes(1);
});
it('normalizes signed ticket identities and rejects conflicting target metadata',()=>{
  const notice={provider:'paystack' as const,event:'charge.success',deliveryId:'fixture',data:{id:912,status:'success',amount:1000,currency:'NGN',reference:'ticket_'+id,metadata:{ticket_id:id,user_id:actor}}};
  expect(normalizeTicket(notice)).toMatchObject({eventId:'charge:912',payload:{ticket_id:id,user_id:actor,payment_id:'912',paid_amount_minor:1000,provider_reference:'ticket_'+id}});
  expect(()=>paymentMetadata({...notice,data:{...notice.data,metadata:{ticket_id:id,tip_id:id}}})).toThrow('Conflicting');
});
it('persists checkout identity before returning JSON or redirecting a browser form',async()=>{
  const response=await POST(new Request('https://app.test',{method:'POST',headers:{'Content-Type':'application/json','Idempotency-Key':'ticket-route-intent'}}),{params:{id:event}});
  expect(response.status).toBe(200);expect(await response.json()).toMatchObject({ticketId:id,status:'pending',redirectUrl:'https://checkout.dodopayments.com/ticket'});
  expect(rpc).toHaveBeenCalledWith('record_ticket_checkout',{p_user_id:actor,p_ticket_id:id,p_checkout_id:'cks_ticket',p_url:'https://checkout.dodopayments.com/ticket'});
  ticket.checkout_url='https://checkout.dodopayments.com/saved';transport.mockClear();
  const form=await POST(new Request('https://app.test',{method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded'},body:'_idempotency=ticket-form-intent'}),{params:{id:event}});
  expect(form.status).toBe(303);expect(form.headers.get('Location')).toBe(ticket.checkout_url);expect(transport).not.toHaveBeenCalled();
});
it('never sends confirmed or expired reservations to a payment provider',async()=>{
  ticket.status='confirmed';
  const request=()=>new Request('https://app.test',{method:'POST',headers:{'Idempotency-Key':'ticket-route-intent'}});
  expect(await (await POST(request(),{params:{id:event}})).json()).toMatchObject({redirectUrl:'/tickets/'+id});
  ticket.status='pending';ticket.reserved_until=new Date(Date.now()-1000).toISOString();
  expect(await (await POST(request(),{params:{id:event}})).json()).toMatchObject({redirectUrl:'/tickets/'+id});
  expect(transport).not.toHaveBeenCalled();
});
it('requires authentication and reports checkout persistence failures without false success',async()=>{
  vi.mocked(getCurrentUser).mockResolvedValueOnce(null);
  expect((await POST(new Request('https://app.test',{method:'POST'}),{params:{id:event}})).status).toBe(401);expect(rpc).not.toHaveBeenCalled();
  rpc.mockImplementation(async(name:string)=>({data:name==='reserve_event_ticket'?ticket:null,error:name==='record_ticket_checkout'?{code:'08006'}:null}));
  expect((await POST(new Request('https://app.test',{method:'POST',headers:{'Idempotency-Key':'ticket-route-intent'}}),{params:{id:event}})).status).toBe(502);
});
const job={provider:'dodopayments',payment_id:'pay_return_fixture',reason:'uncredited_payment',status:'pending',provider_refund_id:null,attempts:1,claim_token:claim,currency:'USD',charged_minor:'1000',refunded_minor:'0'};
it('commits a refund attempt before requesting it and settles only verified provider evidence',async()=>{
  rpc.mockImplementation(async(name:string)=>({data:name==='claim_payment_returns'?[job]:true,error:null}));
  transport.mockImplementation(async(_input:unknown,options?:RequestInit)=>{
    if(options?.method==='POST'){
      expect(rpc).toHaveBeenCalledWith('update_payment_return',expect.objectContaining({p_status:'processing',p_claim:claim}));
      return Response.json({refund_id:'ref_return_fixture'});
    }
    return Response.json({refund_id:'ref_return_fixture',payment_id:job.payment_id,status:'succeeded',amount:1000,currency:'USD'});
  });
  expect(await drainPaymentReturns('ticket-test')).toEqual({scanned:1,completed:1,failed:0});
  expect(rpc).toHaveBeenCalledWith('process_refund_event',expect.objectContaining({p_refund_id:'ref_return_fixture',p_payment_id:job.payment_id,p_amount_minor:1000}));
});
it('holds ambiguous requests for reconciliation instead of issuing a second refund',async()=>{
  rpc.mockImplementation(async(name:string)=>({data:name==='claim_payment_returns'?[{...job,status:'processing',attempts:2}]:true,error:null}));
  expect((await drainPaymentReturns('ticket-test')).failed).toBe(1);expect(transport).not.toHaveBeenCalled();
  expect(rpc).toHaveBeenCalledWith('update_payment_return',expect.objectContaining({p_status:'unknown'}));
});
it('preserves an unknown refund acknowledgement without marking money returned',async()=>{
  rpc.mockImplementation(async(name:string)=>({data:name==='claim_payment_returns'?[job]:true,error:null}));transport.mockRejectedValue(new Error('Lost response'));
  expect((await drainPaymentReturns('ticket-test')).completed).toBe(0);
  expect(rpc).not.toHaveBeenCalledWith('process_refund_event',expect.anything());
  expect(rpc).toHaveBeenCalledWith('update_payment_return',expect.objectContaining({p_status:'unknown'}));
});
it('keeps pre-request configuration failures retryable and never submits without the lease',async()=>{
  rpc.mockImplementation(async(name:string)=>({data:name==='claim_payment_returns'?[job]:true,error:null}));
  vi.stubEnv('DODOPAYMENTS_API_KEY','');
  expect((await drainPaymentReturns('ticket-test')).failed).toBe(1);expect(transport).not.toHaveBeenCalled();
  expect(rpc).toHaveBeenCalledWith('update_payment_return',expect.objectContaining({p_status:'pending'}));
  vi.stubEnv('DODOPAYMENTS_API_KEY','isolated-ticket-key');
  rpc.mockImplementation(async(name:string)=>({data:name==='claim_payment_returns'?[job]:false,error:null}));
  await drainPaymentReturns('ticket-test');expect(transport).not.toHaveBeenCalled();
});
it('verifies provider evidence before the atomic admin reconciliation and rejects forged fields',async()=>{
  transport.mockResolvedValue(Response.json({refund_id:'ref_verified',payment_id:job.payment_id,status:'succeeded',amount:1000,currency:'USD'}));
  const request=(body:Record<string,unknown>)=>new Request('https://app.test',{method:'POST',headers:{'Content-Type':'application/json','Idempotency-Key':'admin-return-intent'},body:JSON.stringify(body)});
  const payload={provider:'dodopayments',payment_id:job.payment_id,refund_id:'ref_verified'};
  expect((await reconcileReturn(request({...payload,amount:1}))).status).toBe(400);expect(transport).not.toHaveBeenCalled();
  expect((await reconcileReturn(request(payload))).status).toBe(200);
  expect(rpc).toHaveBeenCalledWith('reconcile_payment_return',expect.objectContaining({p_actor:actor,p_evidence:{status:'succeeded',refund:{refundId:'ref_verified',paymentId:job.payment_id,amountMinor:1000,currency:'USD'}}}));
  rpc.mockClear();transport.mockResolvedValue(Response.json({refund_id:'ref_verified',payment_id:'pay_someone_else',status:'succeeded',amount:1000,currency:'USD'}));
  expect((await reconcileReturn(request(payload))).status).toBe(503);expect(rpc).not.toHaveBeenCalled();
});

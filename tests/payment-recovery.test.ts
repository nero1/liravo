import { beforeEach,expect,it,vi } from 'vitest';
import { readPaymentRecovery } from '@/lib/payment-recovery';
import { createServiceClient } from '@/lib/supabase/server';
import { paymentWebhook } from '@/lib/payment-handler';
import { readPaymentNotice } from '@/lib/payment-webhooks';
import { fetchCapturedPayment } from '@/lib/refund-reconciliation';

vi.mock('@/lib/supabase/server',()=>({createServiceClient:vi.fn()}));
vi.mock('@/lib/payment-webhooks',async original=>({...await original<typeof import('@/lib/payment-webhooks')>(),readPaymentNotice:vi.fn()}));
vi.mock('@/lib/refund-reconciliation',()=>({fetchCapturedPayment:vi.fn()}));
vi.mock('@/lib/operational-alerts',()=>({observeOperationalSignal:vi.fn()}));
vi.mock('@/lib/metrics',()=>({recordMetric:vi.fn()}));
const owner='00000000-0000-4000-8000-000000000001',tip='00000000-0000-4000-8000-000000000002',foreign='00000000-0000-4000-8000-000000000003';
const rpc=vi.fn();
beforeEach(()=>{
  vi.clearAllMocks();
  vi.mocked(createServiceClient).mockReturnValue({rpc} as unknown as ReturnType<typeof createServiceClient>);
  rpc.mockResolvedValue({data:true,error:null});
  vi.mocked(readPaymentNotice).mockResolvedValue({provider:'dodopayments',deliveryId:'fixture',event:'payment.succeeded',data:{payment_id:'pay_verified_tax',total_amount:550,metadata:{tip_id:tip}}});
  vi.mocked(fetchCapturedPayment).mockResolvedValue({eventId:'payment:pay_verified_tax',payload:{tipId:tip,status:'completed',providerReference:'pay_verified_tax',payment_id:'pay_verified_tax',paid_amount_minor:550,tax_minor:50,currency:'USD'}});
});
it('uses the authoritative Dodo capture and tax before committing payment',async()=>{
  const response=await paymentWebhook(new Request('https://app.test/api/webhooks/payments',{method:'POST'}));
  expect(response.status).toBe(200);expect(fetchCapturedPayment).toHaveBeenCalledWith('dodopayments','pay_verified_tax');
  expect(rpc).toHaveBeenCalledWith('process_payment_event',expect.objectContaining({p_payload:expect.objectContaining({paid_amount_minor:550,tax_minor:50})}));
});
it('rejects authoritative captures whose target differs from the signed notice',async()=>{
  vi.mocked(fetchCapturedPayment).mockResolvedValue({eventId:'payment:pay_verified_tax',payload:{tipId:foreign,status:'completed',providerReference:'pay_verified_tax',payment_id:'pay_verified_tax',paid_amount_minor:550,tax_minor:50,currency:'USD'}});
  const response=await paymentWebhook(new Request('https://app.test',{method:'POST'}));
  expect(response.status).toBe(400);expect(rpc).not.toHaveBeenCalled();
});
it('retains a provider lookup failure for replay without claiming the charge',async()=>{
  vi.mocked(fetchCapturedPayment).mockRejectedValue(new Error('Provider unavailable'));
  expect((await paymentWebhook(new Request('https://app.test',{method:'POST'}))).status).toBe(503);expect(rpc).not.toHaveBeenCalled();
});
it('ignores unrelated merchant payments before any provider lookup',async()=>{
  vi.mocked(readPaymentNotice).mockResolvedValue({provider:'dodopayments',deliveryId:'unrelated',event:'payment.succeeded',data:{payment_id:'pay_other',metadata:{}}});
  expect(await (await paymentWebhook(new Request('https://app.test',{method:'POST'}))).json()).toMatchObject({ignored:true});
  expect(fetchCapturedPayment).not.toHaveBeenCalled();expect(rpc).not.toHaveBeenCalled();
});
it('passes authenticated recovery scope and decodes actual capture/refund totals',async()=>{
  rpc.mockResolvedValue({data:[{currency:'USD',charged_minor:'400',refunded_minor:'100',count:1}],error:null});
  expect(await readPaymentRecovery(owner,'tip',tip)).toEqual([{currency:'USD',charged_minor:400,refunded_minor:100,count:1}]);
  expect(rpc).toHaveBeenCalledWith('read_payment_recovery',{p_user_id:owner,p_kind:'tip',p_entity_id:tip});
});
it('rejects failed or impossible recovery balances instead of displaying zero',async()=>{
  rpc.mockResolvedValueOnce({data:null,error:{code:'08006'}});await expect(readPaymentRecovery(owner,'subscription')).rejects.toThrow('unavailable');
  rpc.mockResolvedValueOnce({data:[{currency:'USD',charged_minor:'100',refunded_minor:'200',count:1}],error:null});await expect(readPaymentRecovery(owner,'subscription')).rejects.toThrow();
});

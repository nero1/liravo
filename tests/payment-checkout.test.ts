import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { cancelProviderSubscription, createTipCheckout, validateCheckoutUrl, validateDodoSubscriptionProduct } from '@/lib/payment-providers';

const fetchMock = vi.fn();
beforeEach(() => {
  vi.stubGlobal('fetch',fetchMock);
  vi.stubEnv('DODOPAYMENTS_API_KEY','isolated-test-key');
  vi.stubEnv('DODOPAYMENTS_ENVIRONMENT','test_mode');
  vi.stubEnv('DODOPAYMENTS_TIP_PRODUCT_ID_USD','tip_product');
  vi.stubEnv('NEXT_PUBLIC_APP_URL','https://app.test');
  fetchMock.mockReset();
});
afterEach(() => { vi.unstubAllEnvs(); vi.unstubAllGlobals(); });
const response=(body: unknown,status=200)=>new Response(JSON.stringify(body),{status});
const tip={id:'00000000-0000-4000-8000-000000000001',amount:'3.00',currency:'USD'};
const product={is_recurring:false,price:{type:'one_time_price',currency:'USD',pay_what_you_want:true,price:50}};

it('opens a checked one-time tip product with exact minor units and a stable provider intent',async()=>{
  fetchMock.mockResolvedValueOnce(response(product)).mockResolvedValueOnce(response({session_id:'cks_tip_fixture',checkout_url:'https://checkout.dodopayments.com/pay/tip'}));
  expect(await createTipCheckout(tip,'reader@example.test')).toEqual({url:'https://checkout.dodopayments.com/pay/tip',checkoutId:'cks_tip_fixture'});
  expect(fetchMock.mock.calls[0][0]).toBe('https://test.dodopayments.com/products/tip_product');
  const [url,request]=fetchMock.mock.calls[1];
  expect(url).toBe('https://test.dodopayments.com/checkouts');
  expect(request.headers['Idempotency-Key']).toBe(`tip_${tip.id}`);
  expect(JSON.parse(request.body)).toMatchObject({product_cart:[{product_id:'tip_product',amount:300,quantity:1}],metadata:{tip_id:tip.id},return_url:`https://app.test/tips/${tip.id}`,feature_flags:{allow_currency_selection:false,allow_discount_code:false}});
});

it('refuses a recurring, wrong-currency, fixed-price or discounted tip product before checkout',async()=>{
  for(const bad of [{...product,is_recurring:true},{...product,price:{...product.price,currency:'EUR'}},{...product,price:{...product.price,pay_what_you_want:false}},{...product,price:{...product.price,discount_bps:100}}]) {
    fetchMock.mockResolvedValueOnce(response(bad));
    await expect(createTipCheckout(tip,'reader@example.test')).rejects.toThrow('Invalid tip product');
  }
  expect(fetchMock).toHaveBeenCalledTimes(4);
});

it('uses Paystack kobo and a stable reference for NGN tips',async()=>{
  vi.stubEnv('PAYSTACK_SECRET_KEY','isolated-test-key');
  fetchMock.mockResolvedValue(response({status:true,data:{reference:`tip_${tip.id}`,authorization_url:'https://checkout.paystack.com/test'}}));
  await createTipCheckout({...tip,amount:'7500.00',currency:'NGN'},'reader@example.test');
  expect(JSON.parse(fetchMock.mock.calls[0][1].body)).toMatchObject({amount:750000,currency:'NGN',reference:`tip_${tip.id}`,callback_url:`https://app.test/tips/${tip.id}`});
});

it('rejects provider failures and untrusted checkout destinations',async()=>{
  fetchMock.mockResolvedValueOnce(response(product)).mockResolvedValueOnce(response({error:'offline'},503));
  await expect(createTipCheckout(tip,'reader@example.test')).rejects.toThrow('503');
  for(const url of ['https://dodopayments.com.attacker.test/pay','http://checkout.dodopayments.com/pay','https://user:password@checkout.dodopayments.com/pay','https://checkout.dodopayments.com:8443/pay']) expect(()=>validateCheckoutUrl('dodopayments',url)).toThrow();
});

it('reconciles an already-cancelled subscription without a second cancellation request',async()=>{
  fetchMock.mockResolvedValue(response({subscription_id:'sub_remote',status:'cancelled'}));
  await cancelProviderSubscription('dodopayments','sub_remote','cancel-intent');
  expect(fetchMock).toHaveBeenCalledTimes(1);
});

it('requires provider confirmation and retains a replayable cancellation identity',async()=>{
  fetchMock.mockResolvedValueOnce(response({subscription_id:'sub_remote',status:'active'})).mockResolvedValueOnce(response({subscription_id:'sub_remote',status:'cancelled'}));
  await cancelProviderSubscription('dodopayments','sub_remote','cancel-intent');
  expect(fetchMock.mock.calls[1][1]).toMatchObject({method:'PATCH',headers:{'Idempotency-Key':'cancel-intent'}});
  expect(JSON.parse(fetchMock.mock.calls[1][1].body)).toEqual({cancel_reason:'cancelled_by_customer',cancel_at_next_billing_date:true});
  fetchMock.mockResolvedValueOnce(response({subscription_id:'sub_other',status:'cancelled'}));
  await expect(cancelProviderSubscription('dodopayments','sub_remote','cancel-intent')).rejects.toThrow('binding');
  await expect(cancelProviderSubscription('dodopayments',null,'cancel-intent')).rejects.toThrow('binding');
});

it('does not invent a recurring Paystack contract for one-time checkouts',async()=>{
  await cancelProviderSubscription('paystack',null,'cancel-intent');
  expect(fetchMock).not.toHaveBeenCalled();
});

it('checks the advertised recurring base price, currency, billing interval and tax policy before checkout',async()=>{
  const recurring={product_id:'premium_product',is_recurring:true,price:{type:'recurring_price',currency:'USD',price:499,payment_frequency_count:1,payment_frequency_interval:'Month'}};
  fetchMock.mockResolvedValueOnce(response(recurring));
  await expect(validateDodoSubscriptionProduct('premium_product','4.99')).resolves.toBeUndefined();
  for(const change of [{price:599},{currency:'EUR'},{payment_frequency_interval:'Year'},{tax_inclusive:true},{discount_bps:1000},{trial_period_days:7},{purchasing_power_parity:true}]){
    fetchMock.mockResolvedValueOnce(response({...recurring,price:{...recurring.price,...change}}));
    await expect(validateDodoSubscriptionProduct('premium_product','4.99')).rejects.toThrow('pricing');
  }
});

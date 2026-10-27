import { z } from 'zod';

export function dodoConnection() {
  const key = process.env.DODOPAYMENTS_API_KEY ?? process.env.DODOPAYMENTS_SECRET_KEY;
  const mode = process.env.DODOPAYMENTS_ENVIRONMENT ?? 'test_mode';
  if (!key || !['test_mode', 'live_mode'].includes(mode)) throw new Error('Dodo is not configured');
  return { key, base: mode === 'live_mode' ? 'https://live.dodopayments.com' : 'https://test.dodopayments.com' };
}

export function validateCheckoutUrl(provider: string, value: unknown) {
  const url = new URL(z.string().url().parse(value));
  if (url.protocol !== 'https:' || url.username || url.password || url.port ||
    (provider === 'paystack' ? url.hostname !== 'checkout.paystack.com' : !/(^|\.)dodopayments\.com$/.test(url.hostname))) throw new Error('Invalid checkout destination');
  return url.href;
}

export interface ProviderCheckout {url:string;checkoutId:string;}
export function checkoutResult(provider:'paystack'|'dodopayments',payload:unknown,reference:string):ProviderCheckout{
  if(provider==='paystack'){
    const result=z.object({status:z.literal(true),data:z.object({reference:z.literal(reference),authorization_url:z.string()})}).parse(payload);
    return {url:validateCheckoutUrl(provider,result.data.authorization_url),checkoutId:reference};
  }
  const result=z.object({session_id:z.string().regex(/^[a-zA-Z0-9_-]{1,150}$/),checkout_url:z.string()}).parse(payload);
  return {url:validateCheckoutUrl(provider,result.checkout_url),checkoutId:result.session_id};
}

export async function createTipCheckout(tip: { id: string; amount: string; currency: string }, email: string) {
  const reference = `tip_${tip.id}`;
  const amount = Math.round(Number(tip.amount) * 100);
  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? 'https://liravo.org';
  if (tip.currency === 'NGN') {
    const secret = process.env.PAYSTACK_SECRET_KEY;
    if (!secret) throw new Error('Paystack is not configured');
    const response = await fetch('https://api.paystack.co/transaction/initialize', {
      method: 'POST', signal: AbortSignal.timeout(8_000),
      headers: { Authorization: `Bearer ${secret}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, amount, currency: tip.currency, reference,
        callback_url: `${appUrl}/tips/${tip.id}`, metadata: { tip_id: tip.id, reference } }),
    });
    if (!response.ok) throw new Error(`Paystack checkout failed: ${response.status}`);
    const result = await response.json();
    return checkoutResult('paystack',result,reference);
  }
  return createFixedCheckout(reference,amount,tip.currency,email,`${appUrl}/tips/${tip.id}`,{tip_id:tip.id,reference});
}

export async function createTicketCheckout(ticket:{id:string;user_id:string;amount_paid:string;currency:string},email:string){
  const reference=`ticket_${ticket.id}`,amount=Math.round(Number(ticket.amount_paid)*100);
  if(!Number.isSafeInteger(amount)||amount<50||amount>500000)throw new Error('Invalid ticket amount');
  const returnUrl=`${process.env.NEXT_PUBLIC_APP_URL??'https://liravo.org'}/tickets/${ticket.id}`;
  const metadata={ticket_id:ticket.id,user_id:ticket.user_id,reference};
  if(ticket.currency==='NGN'){
    const key=process.env.PAYSTACK_SECRET_KEY;if(!key)throw new Error('Paystack unavailable');
    const response=await fetch('https://api.paystack.co/transaction/initialize',{method:'POST',headers:{Authorization:`Bearer ${key}`,'Content-Type':'application/json'},signal:AbortSignal.timeout(8000),body:JSON.stringify({email,amount,currency:ticket.currency,reference,callback_url:returnUrl,metadata})});
    if(!response.ok)throw new Error('Ticket checkout unavailable');
    return checkoutResult('paystack',await response.json(),reference);
  }
  return createFixedCheckout(reference,amount,ticket.currency,email,returnUrl,metadata);
}

async function createFixedCheckout(reference:string,amount:number,currency:string,email:string,returnUrl:string,metadata:Record<string,string>){
  if(!Number.isSafeInteger(amount)||amount<=0||!['USD','EUR'].includes(currency))throw new Error('Invalid checkout amount or currency');
  const {key,base}=dodoConnection(),headers={Authorization:`Bearer ${key}`,'Content-Type':'application/json'},deadline=Date.now()+10000;
  const productResponse=await fetch(`${base}/products`,{method:'POST',headers:{...headers,'Idempotency-Key':`product_${reference}`},signal:AbortSignal.timeout(5000),body:JSON.stringify({name:`Liravo ${reference}`,tax_category:'digital_products',pricing_mode:null,price:{type:'one_time_price',price:amount,currency,pay_what_you_want:false,tax_inclusive:false,purchasing_power_parity:false,discount_bps:0},metadata})});
  if(!productResponse.ok)throw new Error(`Product creation unavailable: ${productResponse.status}`);
  const product=await productResponse.json(),price=product.price;
  const productId=z.string().regex(/^[a-zA-Z0-9_-]{1,150}$/).parse(product.product_id);
  if(product.is_recurring!==false||price?.type!=='one_time_price'||price.currency!==currency||price.price!==amount||price.pay_what_you_want===true||price.tax_inclusive===true||price.purchasing_power_parity||price.discount_bps||price.discount||product.pricing_mode!=null)throw new Error('Invalid product pricing');
  const response=await fetch(`${base}/checkouts`,{method:'POST',headers:{...headers,'Idempotency-Key':reference},signal:AbortSignal.timeout(Math.max(1,deadline-Date.now())),body:JSON.stringify({customer:{email},billing_currency:currency,product_cart:[{product_id:productId,quantity:1}],feature_flags:{allow_currency_selection:false,allow_discount_code:false},return_url:returnUrl,metadata})});
  if(!response.ok)throw new Error(`Checkout unavailable: ${response.status}`);
  return checkoutResult('dodopayments',await response.json(),reference);
}

/** Setting the same remote status is replayable after a lost response. */
export async function cancelProviderSubscription(provider: string, remoteId: string | null, key: string) {
  if (provider === 'paystack') return; // Paystack checkout is a single charge, without a recurring plan.
  if (provider !== 'dodopayments' || !remoteId) throw new Error('Missing recurring subscription binding');
  const connection = dodoConnection();
  const current = await fetch(`${connection.base}/subscriptions/${encodeURIComponent(remoteId)}`, {
    headers: { Authorization: `Bearer ${connection.key}` }, signal: AbortSignal.timeout(5_000),
  });
  if (!current.ok) throw new Error(`Cancellation lookup failed: ${current.status}`);
  const state = await current.json();
  if (state.subscription_id !== remoteId) throw new Error('Subscription binding mismatch');
  if (state.status === 'cancelled' || state.cancel_at_next_billing_date===true) return;
  const response = await fetch(`${connection.base}/subscriptions/${encodeURIComponent(remoteId)}`, {
    method: 'PATCH', signal: AbortSignal.timeout(8_000),
    headers: { Authorization: `Bearer ${connection.key}`, 'Content-Type': 'application/json', 'Idempotency-Key': key },
    body: JSON.stringify({ cancel_reason: 'cancelled_by_customer', cancel_at_next_billing_date: true }),
  });
  if (!response.ok) throw new Error(`Cancellation failed: ${response.status}`);
  const result = await response.json();
  if (result.subscription_id !== remoteId || result.status !== 'cancelled' && result.cancel_at_next_billing_date!==true) throw new Error('Cancellation was not confirmed');
}

export async function validateDodoSubscriptionProduct(productId:string,amount:string) {
  const connection=dodoConnection();
  const response=await fetch(`${connection.base}/products/${encodeURIComponent(productId)}`,{headers:{Authorization:`Bearer ${connection.key}`},signal:AbortSignal.timeout(5_000)});
  if(!response.ok)throw new Error('Subscription product unavailable');
  const product=await response.json(),price=product.price;
  if(product.product_id!==productId||product.is_recurring!==true||price?.type!=='recurring_price'||price.currency!=='USD'||price.price!==Math.round(Number(amount)*100)||price.payment_frequency_count!==1||price.payment_frequency_interval!=='Month'||price.tax_inclusive===true||price.purchasing_power_parity||price.discount_bps||price.discount||price.trial_period_days)throw new Error('Invalid subscription product pricing');
}

import { clientUser } from '@/lib/user-profile';
import { NextResponse } from 'next/server';
import { z } from 'zod';
import { createServiceClient } from '@/lib/supabase/server';
import { getCurrentUser } from '@/lib/auth/getCurrentUser';
import { getSubscriptionPurchase, googlePlayConfiguration } from '@/lib/google-play';
import { reconcileGooglePlayPurchase, PurchaseBindingError } from '@/lib/google-play-reconciliation';
import { checkMoneyRateLimit } from '@/lib/rate-limit';
import { getClientIp, getRequestCorrelationId } from '@/lib/utils';
import { recordMetric } from '@/lib/metrics';
import { observeOperationalSignal } from '@/lib/operational-alerts';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

const schema = z.object({purchaseToken:z.string().min(1).max(4096),productId:z.string().min(1).max(150),packageName:z.string().min(1).max(200)});

export async function POST(request: Request) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({error:'Unauthorized'},{status:401});
  const correlationId = getRequestCorrelationId(request);
  const rate = await checkMoneyRateLimit(user.id,getClientIp(request));
  if (!rate.allowed) return NextResponse.json({error:'Too many requests',correlationId},{status:429});
  const raw = await request.text();
  if (Buffer.byteLength(raw,'utf8')>16_384) return NextResponse.json({error:'Payload too large',correlationId},{status:413});
  let body: unknown;
  try { body=JSON.parse(raw); } catch { return NextResponse.json({error:'Invalid JSON',correlationId},{status:400}); }
  const parsed=schema.safeParse(body);
  const configuration=googlePlayConfiguration();
  if (!parsed.success || parsed.data.productId!==configuration.productId || parsed.data.packageName!==configuration.packageName) return NextResponse.json({error:'Invalid purchase product',code:'INVALID_PURCHASE_PRODUCT',correlationId},{status:400});
  try {
    const verifiedAt = new Date().toISOString();
    const state = await getSubscriptionPurchase(parsed.data.purchaseToken);
    const result = await reconcileGooglePlayPurchase(user.id,parsed.data.purchaseToken,state,verifiedAt,correlationId);
    const {data:profile,error} = await createServiceClient().from('users').select('*').eq('id',user.id).single();
    if (error || !profile) throw new Error('Profile refresh unavailable');
    const pending=result.providerState==='SUBSCRIPTION_STATE_PENDING';
    return NextResponse.json({ok:!pending,pending,active:result.active,acknowledged:result.acknowledged,user:clientUser(profile),correlationId},{status:pending?202:200});
  } catch (error) {
    await observeOperationalSignal('paymentFailures',correlationId);
    const status=error instanceof PurchaseBindingError?error.status:502;
    const code=error instanceof PurchaseBindingError?error.code:'GOOGLE_PLAY_VERIFICATION_UNAVAILABLE';
    recordMetric('google_play_verify_error',{correlationId,code},'error');
    return NextResponse.json({error:'Purchase verification failed',code,correlationId},{status});
  }
}

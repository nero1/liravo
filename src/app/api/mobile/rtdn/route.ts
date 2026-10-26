import { createHash } from 'node:crypto';
import { NextResponse } from 'next/server';
import { z } from 'zod';
import { createServiceClient } from '@/lib/supabase/server';
import { getSubscriptionPurchase, googlePlayConfiguration, googlePlayTokenId, playEntitlement, verifyGooglePlayPush } from '@/lib/google-play';
import { reconcileGooglePlayPurchase, PurchaseBindingError } from '@/lib/google-play-reconciliation';
import { getRequestCorrelationId } from '@/lib/utils';
import { recordMetric } from '@/lib/metrics';
import { observeOperationalSignal } from '@/lib/operational-alerts';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

const envelope=z.object({message:z.object({data:z.string().min(1).max(65536).regex(/^[A-Za-z0-9+/]+={0,2}$/),messageId:z.string().min(1).max(200)}),subscription:z.string().min(1)});
const notification=z.object({packageName:z.string(),subscriptionNotification:z.object({purchaseToken:z.string().min(1).max(4096),subscriptionId:z.string().min(1),notificationType:z.number().int()}).optional(),testNotification:z.record(z.string(),z.unknown()).optional()});

export async function POST(request: Request) {
  const correlationId=getRequestCorrelationId(request);
  const identity=await verifyGooglePlayPush(request);
  if (identity!=='verified') return NextResponse.json({error:identity==='unconfigured'?'Push verification unavailable':'Unauthorized',correlationId},{status:identity==='unconfigured'?503:401});
  const raw=await request.text();
  if (Buffer.byteLength(raw,'utf8')>65536) return NextResponse.json({error:'Payload too large',correlationId},{status:413});
  let parsed: z.infer<typeof envelope>; let notice:z.infer<typeof notification>;
  try { parsed=envelope.parse(JSON.parse(raw));notice=notification.parse(JSON.parse(Buffer.from(parsed.message.data,'base64').toString('utf8'))); }
  catch { return NextResponse.json({error:'Invalid notification',correlationId},{status:400}); }
  const configuration=googlePlayConfiguration();
  if (notice.packageName!==configuration.packageName) return NextResponse.json({error:'Invalid package',correlationId},{status:400});
  if (!notice.subscriptionNotification || notice.subscriptionNotification.subscriptionId!==configuration.productId) return NextResponse.json({received:true,ignored:true,correlationId});
  const fingerprint=createHash('sha256').update(parsed.message.data).digest('hex');
  const client=createServiceClient();
  try {
    const {data:receipt,error:receiptError}=await client.from('billing_webhook_receipts' as never).select('fingerprint,status').eq('provider','google_play').eq('delivery_id',parsed.message.messageId).maybeSingle();
    if (receiptError) throw new Error('Billing receipt unavailable');
    const previous=receipt as {fingerprint:string;status:string}|null;
    if (previous && previous.fingerprint!==fingerprint) throw new PurchaseBindingError(409,'BILLING_EVENT_CONFLICT');
    if (previous?.status==='processed') return NextResponse.json({received:true,replay:true,correlationId});
    const token=notice.subscriptionNotification.purchaseToken;
    const verifiedAt=new Date().toISOString();
    const state=await getSubscriptionPurchase(token);
    const entitlement=playEntitlement(state);
    const {data:existing,error:bindingError}=await client.from('subscriptions').select('user_id').eq('provider','google_play').eq('provider_event_id',googlePlayTokenId(token)).maybeSingle();
    if (bindingError) throw new Error('Purchase binding unavailable');
    let userId=existing?.user_id;
    if (!userId && entitlement.accountId) {
      const {data:account,error}=await client.from('billing_accounts' as never).select('user_id').eq('provider','google_play').eq('account_id',entitlement.accountId).maybeSingle();
      if (error) throw new Error('Billing account unavailable');
      userId=(account as {user_id:string}|null)?.user_id;
    }
    if (!userId && state.linkedPurchaseToken) {
      const {data:linked,error}=await client.from('subscriptions').select('user_id').eq('provider','google_play').eq('provider_event_id',googlePlayTokenId(state.linkedPurchaseToken)).maybeSingle();
      if (error) throw new Error('Linked purchase unavailable');
      userId=linked?.user_id;
    }
    if (!userId) throw new PurchaseBindingError(503,'PURCHASE_ACCOUNT_NOT_BOUND');
    await reconcileGooglePlayPurchase(userId,token,state,verifiedAt,correlationId,{id:parsed.message.messageId,fingerprint});
    return NextResponse.json({received:true,correlationId});
  } catch (error) {
    const code=error instanceof PurchaseBindingError?error.code:'GOOGLE_PLAY_DEPENDENCY_FAILURE';
    await observeOperationalSignal(code==='BILLING_EVENT_CONFLICT'?'webhookConflicts':'paymentFailures',correlationId);
    recordMetric('google_play_rtdn_error',{correlationId,code},'error');
    return NextResponse.json({error:'Notification processing unavailable',code,correlationId},{status:error instanceof PurchaseBindingError?error.status:503});
  }
}

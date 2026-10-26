import { NextResponse } from 'next/server';
import { z } from 'zod';
import { verifyProviderSignature } from '@/lib/webhook-security';

type Provider = 'paystack' | 'dodopayments';
export interface PaymentNotice {
  provider: Provider;
  deliveryId: string;
  event: string;
  data: Record<string, unknown>;
  timestamp?: string;
}
const uuid = z.string().uuid();
const identifier = z.union([z.string().min(1).max(150), z.number().int().nonnegative()]);
const currency = z.enum(['USD', 'NGN', 'EUR']);
const timestamp = z.string().datetime({ offset: true });

/** Verifies the original provider body before reading metadata or normalizing events. */
export async function readPaymentNotice(request: Request): Promise<PaymentNotice | NextResponse> {
  const paystack = request.headers.get('x-paystack-signature');
  const dodo = request.headers.get('webhook-signature');
  if ((!paystack && !dodo) || (paystack && dodo)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const provider: Provider = paystack ? 'paystack' : 'dodopayments';
  const secret = provider === 'paystack' ? process.env.PAYSTACK_SECRET_KEY : process.env.DODOPAYMENTS_WEBHOOK_SECRET;
  if (!secret) return NextResponse.json({ error: 'Webhook verification unavailable' }, { status: 503 });
  const body = await request.text();
  if (Buffer.byteLength(body, 'utf8') > 65536) return NextResponse.json({ error: 'Payload too large' }, { status: 413 });
  const deliveryId = request.headers.get('webhook-id') ?? '';
  if (!verifyProviderSignature({ provider, secret, body, signature: paystack ?? dodo!, timestamp: request.headers.get('webhook-timestamp'), webhookId: deliveryId })) {
    return NextResponse.json({ error: 'Invalid signature' }, { status: 401 });
  }
  try {
    const parsed = z.object({ event: z.string().min(1).max(100).optional(), type: z.string().min(1).max(100).optional(), timestamp: z.string().optional(), data: z.record(z.string(), z.unknown()) }).parse(JSON.parse(body));
    const event = z.string().min(1).max(100).parse(provider === 'paystack' ? parsed.event : parsed.type);
    return { provider, deliveryId, event, data: parsed.data, timestamp: parsed.timestamp };
  } catch { return NextResponse.json({ error: 'Invalid webhook payload' }, { status: 400 }); }
}

export function paymentMetadata(notice: PaymentNotice): Record<string, unknown> {
  const metadata = notice.data.metadata;
  if (metadata === undefined || metadata === null || metadata === '') return {};
  return z.record(z.string(), z.unknown()).parse(typeof metadata === 'string' ? JSON.parse(metadata) : metadata ?? {});
}

export function normalizeSubscription(notice: PaymentNotice) {
  const metadata = paymentMetadata(notice);
  if (metadata.subscription_id && metadata.tip_id) z.never().parse(metadata);
  const paid = notice.event === (notice.provider === 'paystack' ? 'charge.success' : 'payment.succeeded');
  const cancelled = notice.provider === 'dodopayments' && ['subscription.cancelled','subscription.expired'].includes(notice.event);
  if ((!paid && !cancelled) || !metadata.subscription_id) return null;
  if (paid && (notice.provider === 'paystack' || notice.data.status != null)) z.literal(notice.provider === 'paystack' ? 'success' : 'succeeded').parse(notice.data.status);
  const remoteId = notice.data.subscription_id ?? (Array.isArray(notice.data.subscription_ids) && notice.data.subscription_ids.length === 1 ? notice.data.subscription_ids[0] : undefined);
  const result = {
    event: paid ? 'subscription.activated' : 'subscription.cancelled',
    user_id: uuid.parse(metadata.user_id), subscription_id: uuid.parse(metadata.subscription_id),
    provider_event_at: timestamp.parse(notice.provider === 'paystack' ? notice.data.paid_at : notice.timestamp),
    provider_subscription_id: remoteId === undefined || remoteId === null ? null : z.string().min(1).max(150).parse(remoteId),
  };
  const eventId = paid ? `${notice.provider === 'paystack' ? 'charge' : 'payment'}:${identifier.parse(notice.provider === 'paystack' ? notice.data.id : notice.data.payment_id)}` : identifier.parse(notice.deliveryId).toString();
  let periodEnd: string | undefined;
  if (paid) {
    if (notice.provider==='paystack') periodEnd=new Date(Date.parse(result.provider_event_at)+30*86400000).toISOString();
    else {
      const periods=z.array(z.object({subscription_id:z.string(),starts_at:timestamp,ends_at:timestamp})).parse(notice.data.service_periods);
      const period=periods.find(item=>item.subscription_id===result.provider_subscription_id);
      if (!period || Date.parse(period.ends_at)<=Date.parse(period.starts_at)) throw new Error('Verified service period unavailable');
      periodEnd=period.ends_at;
    }
  }
  return {
    eventId, payload: {
      ...result,
      ...(paid ? {
        payment_id: identifier.parse(notice.provider==='paystack'?notice.data.id:notice.data.payment_id).toString(),
        period_end:periodEnd,
        tax_minor:notice.provider==='dodopayments'?z.number().int().nonnegative().parse(notice.data.tax??0):0,
        paid_amount_minor: z.number().int().nonnegative().parse(notice.provider === 'paystack' ? notice.data.amount : notice.data.total_amount),
        currency: currency.parse(notice.data.currency),
        provider_reference: notice.provider === 'paystack' ? z.string().parse(notice.data.reference) : metadata.reference ?? null,
      } : {}),
    },
  };
}

export function normalizeTip(notice: PaymentNotice) {
  const metadata = paymentMetadata(notice);
  if (metadata.subscription_id && metadata.tip_id) z.never().parse(metadata);
  const completed = notice.event === (notice.provider === 'paystack' ? 'charge.success' : 'payment.succeeded');
  const failed = notice.provider === 'dodopayments' && notice.event === 'payment.failed';
  if ((!completed && !failed) || !metadata.tip_id) return null;
  if (completed && (notice.provider === 'paystack' || notice.data.status != null)) z.literal(notice.provider === 'paystack' ? 'success' : 'succeeded').parse(notice.data.status);
  const reference = identifier.parse(notice.provider === 'paystack' ? notice.data.id : notice.data.payment_id).toString();
  return {
    eventId: `${completed ? (notice.provider === 'paystack' ? 'charge' : 'payment') : 'failed'}:${reference}`,
    payload: {
      tipId: uuid.parse(metadata.tip_id), status: completed ? 'completed' : 'failed', providerReference: reference,
      ...(completed ? {
        payment_id:reference,
        tax_minor:notice.provider==='dodopayments'?z.number().int().nonnegative().parse(notice.data.tax??0):0,
        paid_amount_minor: z.number().int().nonnegative().parse(notice.provider === 'paystack' ? notice.data.amount : notice.data.total_amount),
        currency: currency.parse(notice.data.currency),
      } : {}),
    },
  };
}

export function normalizeRefund(notice:PaymentNotice) {
  if(notice.event!==(notice.provider==='paystack'?'refund.processed':'refund.succeeded'))return null;
  z.literal(notice.provider==='paystack'?'processed':'succeeded').parse(notice.data.status);
  const transaction=notice.data.transaction;
  const paymentId=notice.provider==='paystack'?(typeof transaction==='object'&&transaction!==null?(transaction as {id?:unknown}).id:transaction):notice.data.payment_id;
  return {refundId:identifier.parse(notice.provider==='paystack'?notice.data.id:notice.data.refund_id).toString(),paymentId:identifier.parse(paymentId).toString(),amountMinor:z.number().int().positive().parse(notice.data.amount),currency:currency.parse(notice.data.currency)};
}

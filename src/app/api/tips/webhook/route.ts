import { NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase/server';
import { readPaymentNotice, normalizeTip } from '@/lib/payment-webhooks';
import { getRequestCorrelationId } from '@/lib/utils';
import { recordMetric } from '@/lib/metrics';
import { ZodError } from 'zod';

export const dynamic = 'force-dynamic';

export async function POST(request: Request) {
  const correlationId = getRequestCorrelationId(request);
  const notice = await readPaymentNotice(request);
  if (notice instanceof NextResponse) {
    notice.headers.set('x-request-id',correlationId);
    recordMetric('webhook_verification_rejected', { route: 'tips', correlationId, status: notice.status }, 'warn');
    return notice;
  }
  try {
    const event = normalizeTip(notice);
    if (!event) return NextResponse.json({ received: true, ignored: true });
    const { data, error } = await createServiceClient().rpc('process_payment_event' as never, {
      p_provider: notice.provider, p_event_id: event.eventId, p_payload: event.payload, p_correlation_id: correlationId,
    } as never);
    if (error) {
      const codes: Record<string,string> = { P1001: 'PAYMENT_EVENT_CONFLICT', P1002: 'PAYMENT_AMOUNT_MISMATCH', P1003: 'PAYMENT_BINDING_MISMATCH' };
      const code=codes[error.code] ?? 'PAYMENT_DEPENDENCY_FAILURE';
      recordMetric(error.code === 'P1001' ? 'payment_webhook_conflict' : 'payment_webhook_error', { correlationId, provider: notice.provider, eventId: event.eventId, code }, 'error');
      return NextResponse.json({ error: 'Payment processing failed', code, correlationId }, { status: error.code === 'P1001' ? 409 : codes[error.code] ? 400 : 503 });
    }
    if (data === false) recordMetric('payment_webhook_replay', { correlationId, provider: notice.provider, eventId: event.eventId });
    return NextResponse.json({ received: true, correlationId });
  } catch (error) {
    recordMetric('tip_webhook_error', { correlationId, provider: notice.provider, event: notice.event }, 'error');
    return NextResponse.json({ error: 'Payment processing failed', correlationId }, { status: error instanceof ZodError ? 400 : 503 });
  }
}

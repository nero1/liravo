import { NextResponse } from 'next/server';
import { z } from 'zod';
import Decimal from 'decimal.js';
import { createServiceClient } from '@/lib/supabase/server';
import { verifyProviderSignature } from '@/lib/webhook-security';

export const dynamic = 'force-dynamic';

const schema = z.object({
  tipId: z.string().uuid(),
  status: z.enum(['completed', 'failed']),
  providerReference: z.string().optional(),
});

export async function POST(req: Request) {
  const provider = req.headers.get('x-payment-provider');
  if (!provider) {
    return NextResponse.json({ error: 'Missing x-payment-provider header' }, { status: 400 });
  }

  const signature = req.headers.get('x-webhook-signature') ?? req.headers.get('x-paystack-signature');
  const timestamp = req.headers.get('x-webhook-timestamp');
  const expectedSecret = process.env.PAYMENT_WEBHOOK_SECRET;

  if (!expectedSecret || !signature) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const rawBody = await req.text();
  const validSig = verifyProviderSignature({
    provider,
    body: rawBody,
    secret: expectedSecret,
    signature,
    timestamp,
  });
  if (!validSig) {
    return NextResponse.json({ error: 'Invalid signature' }, { status: 400 });
  }

  let body: unknown;
  try {
    body = JSON.parse(rawBody);
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const { tipId, status, providerReference } = parsed.data;

  const supabase = createServiceClient();

  const { data: tip, error: tipError } = await supabase
    .from('tips')
    .update({ status, provider_reference: providerReference ?? null })
    .eq('id', tipId)
    .select()
    .single();

  if (tipError || !tip) {
    return NextResponse.json({ error: tipError?.message ?? 'Tip not found' }, { status: 404 });
  }

  if (status === 'completed') {
    // Create payout record
    await supabase
      .from('payouts')
      .insert({
        tip_id: tipId,
        recipient_id: tip.recipient_id,
        amount: tip.recipient_amount,
        currency: tip.currency,
        status: 'pending',
        provider,
      });

    // Credit 10% referral commission to the tipper's referrer, if any
    const { data: tipperUser } = await supabase
      .from('users')
      .select('referred_by')
      .eq('id', tip.tipper_id)
      .single();

    if (tipperUser?.referred_by) {
      const gross = new Decimal(tip.amount);
      const commissionAmount = gross.times('0.10').toDecimalPlaces(2);

      await supabase
        .from('referral_commissions')
        .insert({
          referrer_id: tipperUser.referred_by,
          referred_user_id: tip.tipper_id,
          transaction_type: 'tip',
          transaction_id: tipId,
          gross_amount: gross.toFixed(2),
          commission_rate: 0.10,
          commission_amount: commissionAmount.toFixed(2),
          currency: tip.currency,
          status: 'pending',
        });
    }
  }

  return NextResponse.json({ received: true, tipId, status });
}

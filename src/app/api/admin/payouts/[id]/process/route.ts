import { createClient, createServiceClient } from '@/lib/supabase/server';
import { NextResponse } from 'next/server';
import Decimal from 'decimal.js';
import { recordMetric } from '@/lib/metrics';
import { getRequestCorrelationId } from '@/lib/utils';
import { getCurrentUser } from '@/lib/auth/getCurrentUser';
import { observeOperationalSignal } from '@/lib/operational-alerts';

export const dynamic = 'force-dynamic';

async function paystackCreateRecipient(opts: {
  name: string;
  accountNumber: string;
  bankCode: string;
  currency: string;
}): Promise<string> {
  const secret = process.env.PAYSTACK_SECRET_KEY;
  if (!secret) throw new Error('PAYSTACK_SECRET_KEY not configured');

  const res = await fetch('https://api.paystack.co/transferrecipient', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${secret}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      type: 'nuban',
      name: opts.name,
      account_number: opts.accountNumber,
      bank_code: opts.bankCode,
      currency: opts.currency,
    }),
  });

  if (!res.ok) {
    const err = await res.text().catch(() => '');
    throw new Error(`Failed to create Paystack recipient: ${res.status} ${err}`);
  }

  const data = await res.json() as { data?: { recipient_code?: string } };
  const code = data?.data?.recipient_code;
  if (!code) throw new Error('Paystack did not return recipient_code');
  return code;
}

async function paystackInitiateTransfer(opts: {
  recipientCode: string;
  amountKobo: number;
  reason: string;
  reference: string;
}): Promise<string> {
  const secret = process.env.PAYSTACK_SECRET_KEY;
  if (!secret) throw new Error('PAYSTACK_SECRET_KEY not configured');

  const res = await fetch('https://api.paystack.co/transfer', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${secret}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      source: 'balance',
      amount: opts.amountKobo,
      recipient: opts.recipientCode,
      reason: opts.reason,
      reference: opts.reference,
    }),
  });

  if (!res.ok) {
    const err = await res.text().catch(() => '');
    throw new Error(`Paystack transfer failed: ${res.status} ${err}`);
  }

  const data = await res.json() as { data?: { transfer_code?: string; status?: string } };
  return data?.data?.transfer_code ?? 'unknown';
}

export async function POST(
  req: Request,
  { params }: { params: { id: string } }
) {
  const correlationId = getRequestCorrelationId(req);
  const supabase = createClient();
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { data: adminProfile } = await supabase
    .from('users')
    .select('is_admin')
    .eq('id', user.id)
    .single();
  if (!adminProfile?.is_admin) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  const serviceClient = createServiceClient();

  // Fetch the payout request
  const { data: payout, error: fetchErr } = await serviceClient
    .from('payouts')
    .select('id, recipient_id, amount, currency, status, provider')
    .eq('id', params.id)
    .single();

  if (fetchErr || !payout) {
    return NextResponse.json({ error: 'Payout not found' }, { status: 404 });
  }

  if (payout.status !== 'pending') {
    return NextResponse.json({ error: `Payout is already ${payout.status}` }, { status: 409 });
  }

  const provider = payout.provider ?? 'paystack';

  // Mark as processing first
  await serviceClient
    .from('payouts')
    .update({ status: 'processing' })
    .eq('id', params.id);

  try {
    if (provider === 'paystack') {
      // Fetch recipient's payout bank details
      const { data: bankDetails } = await serviceClient
        .from('user_payout_methods')
        .select('account_number, bank_code, display_name, paystack_recipient_code, currency')
        .eq('user_id', payout.recipient_id)
        .eq('provider', 'paystack')
        .single();

      if (!bankDetails) {
        await serviceClient.from('payouts').update({ status: 'failed' }).eq('id', params.id);
        return NextResponse.json({ error: 'Recipient has no Paystack payout method configured' }, { status: 422 });
      }

      let recipientCode = bankDetails.paystack_recipient_code;

      if (!recipientCode) {
        recipientCode = await paystackCreateRecipient({
          name: bankDetails.display_name,
          accountNumber: bankDetails.account_number,
          bankCode: bankDetails.bank_code,
          currency: bankDetails.currency ?? payout.currency,
        });
        await serviceClient
          .from('user_payout_methods')
          .update({ paystack_recipient_code: recipientCode })
          .eq('user_id', payout.recipient_id)
          .eq('provider', 'paystack');
      }

      const currency = bankDetails.currency ?? payout.currency;
      const amount = new Decimal(payout.amount);
      const amountInSmallestUnit = currency === 'NGN'
        ? amount.times(100).toFixed(0)   // kobo
        : amount.times(100).toFixed(0);  // cents

      const reference = `payout_${params.id}_${Date.now()}`;
      const transferCode = await paystackInitiateTransfer({
        recipientCode,
        amountKobo: parseInt(amountInSmallestUnit, 10),
        reason: 'Liravo creator earnings payout',
        reference,
      });

      await serviceClient
        .from('payouts')
        .update({ status: 'completed', provider: 'paystack' })
        .eq('id', params.id);

      await serviceClient.from('financial_audit_log').insert({
        actor_user_id: user.id,
        target_user_id: payout.recipient_id,
        action: 'payout_processed',
        amount: payout.amount,
        currency: payout.currency,
        provider: 'paystack',
        correlation_id: correlationId,
        metadata: { payout_id: params.id, transfer_code: transferCode, reference },
      });

      recordMetric('payout_processed', { provider: 'paystack', correlationId });
      return NextResponse.json({ processed: true, provider: 'paystack', transfer_code: transferCode });
    }

    // For dodopayments or other providers: mark as processing and return
    // (requires manual completion or provider webhook)
    recordMetric('payout_processing_deferred', { provider, correlationId });
    return NextResponse.json({ processed: false, message: `Payout queued for ${provider} — complete manually or await provider webhook` });
  } catch (err) {
    await observeOperationalSignal('payoutFailures',correlationId);
    const message = err instanceof Error ? err.message : 'Unknown error';
    await serviceClient.from('payouts').update({ status: 'failed' }).eq('id', params.id);
    recordMetric('payout_process_error', { provider, error: message, correlationId }, 'error');
    return NextResponse.json({ error: message }, { status: 502 });
  }
}

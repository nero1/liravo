import { NextResponse } from 'next/server';
import { z } from 'zod';
import { createServiceClient } from '@/lib/supabase/server';

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

  const body = await req.json();
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
    // Create payout record (scaffold)
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
  }

  return NextResponse.json({ received: true, tipId, status });
}

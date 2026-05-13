import { createClient } from '@/lib/supabase/server';
import { NextResponse } from 'next/server';
import { z } from 'zod';
import Decimal from 'decimal.js';

const bodySchema = z.object({
  provider: z.enum(['dodopayments', 'paystack']),
  currency: z.enum(['USD', 'NGN']),
});

const PRICE_USD = new Decimal('4.99');
const PRICE_NGN = new Decimal('7500');

export async function POST(req: Request) {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  let body: unknown;
  const contentType = req.headers.get('content-type') ?? '';
  if (contentType.includes('application/json')) {
    body = await req.json().catch(() => ({}));
  } else {
    const form = await req.formData().catch(() => new FormData());
    body = { provider: form.get('provider'), currency: form.get('currency') };
  }

  const parsed = bodySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const { provider, currency } = parsed.data;
  const amount = currency === 'NGN' ? PRICE_NGN.toFixed(2) : PRICE_USD.toFixed(2);

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { error: insertError } = await (supabase as any).from('subscriptions').insert({
    user_id: user.id,
    provider,
    status: 'pending',
    amount,
    currency,
    created_at: new Date().toISOString(),
  });

  if (insertError) {
    return NextResponse.json({ error: insertError.message }, { status: 500 });
  }

  const checkoutUrl =
    provider === 'paystack'
      ? `https://placeholder.paystack.co/checkout/${user.id}`
      : `https://placeholder.dodopayments.com/checkout/${user.id}`;

  // For form submissions, redirect to checkout
  const accept = req.headers.get('accept') ?? '';
  if (!accept.includes('application/json')) {
    return NextResponse.redirect(checkoutUrl, 303);
  }

  return NextResponse.json({ checkoutUrl }, { status: 201 });
}

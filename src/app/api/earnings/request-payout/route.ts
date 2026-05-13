import { createClient } from '@/lib/supabase/server';
import { NextResponse } from 'next/server';
import { z } from 'zod';

const bodySchema = z.object({
  amount: z.string().optional(),
  method: z.enum(['dodopayments', 'paystack']).optional(),
}).optional();

export async function POST(req: Request) {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  let body: unknown = {};
  const contentType = req.headers.get('content-type') ?? '';
  if (contentType.includes('application/json')) {
    body = await req.json().catch(() => ({}));
  } else {
    const form = await req.formData().catch(() => new FormData());
    body = { amount: form.get('amount'), method: form.get('method') };
  }

  const parsed = bodySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { error: insertError } = await (supabase as any).from('payout_requests').insert({
    user_id: user.id,
    amount: parsed.data?.amount ?? '0.00',
    method: parsed.data?.method ?? 'dodopayments',
    status: 'pending',
    created_at: new Date().toISOString(),
  });

  if (insertError) {
    return NextResponse.json({ error: insertError.message }, { status: 500 });
  }

  const accept = req.headers.get('accept') ?? '';
  if (!accept.includes('application/json')) {
    return new Response(null, {
      status: 303,
      headers: { Location: '/earnings' },
    });
  }

  return NextResponse.json({ requested: true }, { status: 201 });
}

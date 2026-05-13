import { createClient } from '@/lib/supabase/server';
import { NextResponse } from 'next/server';
import { z } from 'zod';
import Decimal from 'decimal.js';
import { createNotification } from '@/services/notifications';
import { awardXP } from '@/services/xp';

const schema = z.object({
  recipientId: z.string().uuid(),
  amount: z.number().min(0.5),
  currency: z.string().default('USD'),
});

export async function POST(req: Request) {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const body = await req.json();
  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const { recipientId, amount, currency } = parsed.data;

  if (recipientId === user.id) {
    return NextResponse.json({ error: 'You cannot tip yourself' }, { status: 400 });
  }

  // Verify recipient exists
  const { data: recipient } = await supabase
    .from('users')
    .select('id, display_name')
    .eq('id', recipientId)
    .single();

  if (!recipient) {
    return NextResponse.json({ error: 'Recipient not found' }, { status: 404 });
  }

  // Calculate fees using Decimal.js
  const decAmount = new Decimal(amount);
  const platformFee = decAmount.times(0.1).toDecimalPlaces(2);
  const recipientAmount = decAmount.minus(platformFee).toDecimalPlaces(2);

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: tip, error } = await (supabase as any)
    .from('tips')
    .insert({
      user_id: user.id,
      recipient_id: recipientId,
      amount: decAmount.toNumber(),
      platform_fee: platformFee.toNumber(),
      recipient_amount: recipientAmount.toNumber(),
      currency,
      status: 'pending',
    })
    .select()
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  // Notify recipient
  await createNotification({
    userId: recipientId,
    type: 'like',
    actorId: user.id,
    entityType: 'tip',
    entityId: tip.id,
    message: `You received a $${decAmount.toFixed(2)} tip!`,
  });

  // Award XP to sender (5 XP for tipping)
  await awardXP(user.id, 5, 'tip_sent');

  return NextResponse.json({
    tipId: tip.id,
    redirectUrl: '/tips/pending',
  });
}

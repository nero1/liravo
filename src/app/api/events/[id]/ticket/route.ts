import { createClient } from '@/lib/supabase/server';
import { NextResponse } from 'next/server';
import Decimal from 'decimal.js';

export async function POST(
  _req: Request,
  { params }: { params: { id: string } }
) {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: event } = await (supabase as any)
    .from('events')
    .select('id, title, is_paid, price, currency, event_date, host_id')
    .eq('id', params.id)
    .single();

  if (!event) {
    return NextResponse.json({ error: 'Event not found' }, { status: 404 });
  }

  if (!event.is_paid) {
    return NextResponse.json(
      { error: 'This is a free event. Use the RSVP endpoint instead.' },
      { status: 400 }
    );
  }

  // Check if already purchased
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: existing } = await (supabase as any)
    .from('event_tickets')
    .select('id')
    .eq('event_id', params.id)
    .eq('user_id', user.id)
    .single();

  if (existing) {
    return NextResponse.json({ error: 'Already purchased a ticket' }, { status: 409 });
  }

  // Calculate fees using Decimal.js
  const price = new Decimal(event.price ?? 0);
  const platformFee = price.times(0.1).toDecimalPlaces(2);
  const hostAmount = price.minus(platformFee).toDecimalPlaces(2);

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: ticket, error } = await (supabase as any)
    .from('event_tickets')
    .insert({
      event_id: params.id,
      user_id: user.id,
      amount_paid: price.toNumber(),
      platform_fee: platformFee.toNumber(),
      host_amount: hostAmount.toNumber(),
      currency: event.currency ?? 'USD',
      status: 'pending',
    })
    .select()
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  // Scaffold: return mock payment redirect URL
  return NextResponse.json({
    ticketId: ticket.id,
    redirectUrl: `/events/${params.id}/payment-pending?ticket=${ticket.id}`,
    amount: price.toNumber(),
    platformFee: platformFee.toNumber(),
    hostAmount: hostAmount.toNumber(),
    currency: event.currency ?? 'USD',
  });
}

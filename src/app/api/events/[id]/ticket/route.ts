import { createClient } from '@/lib/supabase/server';
import { NextResponse } from 'next/server';
import Decimal from 'decimal.js';
import { z } from 'zod';

const paramsSchema = z.object({ id: z.string().uuid() });

export async function POST(
  _req: Request,
  { params }: { params: { id: string } }
) {
  const supabase = createClient();
  if (!paramsSchema.safeParse(params).success) {
    return NextResponse.json({ error: 'Invalid event id' }, { status: 400 });
  }
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { data: event } = await supabase
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

  // Bugfix: early idempotency support for client retries.
  const idemKey = _req.headers.get('x-idempotency-key');
  if (idemKey) {
    const { data: idemTicket } = await supabase
      .from('event_tickets')
      .select('id, amount_paid, platform_fee, host_amount, currency')
      .eq('event_id', params.id)
      .eq('user_id', user.id)
      .eq('idempotency_key', idemKey)
      .maybeSingle();

    if (idemTicket) {
      return NextResponse.json({
        ticketId: idemTicket.id,
        redirectUrl: `/events/${params.id}/payment-pending?ticket=${idemTicket.id}`,
        amount: idemTicket.amount_paid,
        platformFee: idemTicket.platform_fee,
        hostAmount: idemTicket.host_amount,
        currency: idemTicket.currency,
      });
    }
  }

  // Check if already purchased
  const { data: existing } = await supabase
    .from('event_tickets')
    .select('id, status, created_at, amount_paid, platform_fee, host_amount, currency')
    .eq('event_id', params.id)
    .eq('user_id', user.id)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (existing) {
    // Bugfix: pending-ticket lifecycle handling to avoid duplicate pending rows.
    if (existing.status === 'pending') {
      const createdAtMs = existing.created_at ? new Date(existing.created_at).getTime() : Date.now();
      const ageMs = Date.now() - createdAtMs;
      const pendingTtlMs = 15 * 60 * 1000;

      if (ageMs <= pendingTtlMs) {
        return NextResponse.json({
          ticketId: existing.id,
          redirectUrl: `/events/${params.id}/payment-pending?ticket=${existing.id}`,
          amount: existing.amount_paid,
          platformFee: existing.platform_fee,
          hostAmount: existing.host_amount,
          currency: existing.currency ?? event.currency ?? 'USD',
          reusedPending: true,
        });
      }

      await supabase
        .from('event_tickets')
        .update({ status: 'expired' })
        .eq('id', existing.id);
    }

    return NextResponse.json({ error: 'Already purchased a ticket' }, { status: 409 });
  }

  // Calculate fees using Decimal.js
  const price = new Decimal(event.price ?? 0);
  const platformFee = price.times(0.1).toDecimalPlaces(2);
  const hostAmount = price.minus(platformFee).toDecimalPlaces(2);

  const { data: ticket, error } = await supabase
    .from('event_tickets')
    .insert({
      event_id: params.id,
      user_id: user.id,
      amount_paid: price.toNumber(),
      platform_fee: platformFee.toNumber(),
      host_amount: hostAmount.toNumber(),
      currency: event.currency ?? 'USD',
      status: 'pending',
      idempotency_key: idemKey,
    })
    .select()
    .single();

  if (error) {
    // Bugfix: clear conflict response for unique(event_id,user_id) and idempotent retries.
    if (error.code === '23505') {
      return NextResponse.json({ error: 'Ticket already exists for this user/event' }, { status: 409 });
    }
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

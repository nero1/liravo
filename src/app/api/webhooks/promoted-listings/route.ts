import { createServiceClient } from '@/lib/supabase/server';
import { NextResponse } from 'next/server';

export async function POST(req: Request) {
  const secret = req.headers.get('x-webhook-secret');
  const expectedSecret = process.env.PAYMENT_WEBHOOK_SECRET;

  if (!expectedSecret || secret !== expectedSecret) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  let body: { listing_id?: string; user_id?: string; event?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const { listing_id, user_id, event } = body;

  if (!listing_id || !event) {
    return NextResponse.json({ error: 'Missing listing_id or event' }, { status: 400 });
  }

  if (event !== 'payment.completed') {
    return NextResponse.json({ received: true });
  }

  const supabase = createServiceClient();

  const now = new Date();
  const endDate = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);

  const { error: updateError } = await supabase
    .from('promoted_listings')
    .update({
      status: 'active',
      start_date: now.toISOString(),
      end_date: endDate.toISOString(),
    })
    .eq('id', listing_id);

  if (updateError) {
    return NextResponse.json({ error: updateError.message }, { status: 500 });
  }

  // Notify the requester
  if (user_id) {
    await supabase.from('notifications').insert({
      user_id,
      type: 'promoted_listing_activated',
      message: 'Your promoted listing has been activated and is now live for 30 days.',
      is_read: false,
      created_at: now.toISOString(),
    });
  }

  return NextResponse.json({ activated: true });
}

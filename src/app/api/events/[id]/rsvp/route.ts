import { createClient } from '@/lib/supabase/server';
import { NextResponse } from 'next/server';

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
    .select('id, is_paid, event_date')
    .eq('id', params.id)
    .single();

  if (!event) {
    return NextResponse.json({ error: 'Event not found' }, { status: 404 });
  }

  if (event.is_paid) {
    return NextResponse.json(
      { error: 'This is a paid event. Please purchase a ticket instead.' },
      { status: 400 }
    );
  }

  // Check if already RSVP'd
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: existing } = await (supabase as any)
    .from('event_rsvps')
    .select('id')
    .eq('event_id', params.id)
    .eq('user_id', user.id)
    .single();

  if (existing) {
    return NextResponse.json({ rsvped: true, alreadyRsvped: true });
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { error } = await (supabase as any)
    .from('event_rsvps')
    .insert({
      event_id: params.id,
      user_id: user.id,
    });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ rsvped: true });
}

import { createClient } from '@/lib/supabase/server';
import { NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/auth/getCurrentUser';

export const dynamic = 'force-dynamic';

export async function POST(
  _req: Request,
  { params }: { params: { id: string } }
) {
  const supabase = createClient();
  const user = await getCurrentUser();

  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { data: event } = await supabase
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
  const { data: existing } = await supabase
    .from('event_rsvps')
    .select('id')
    .eq('event_id', params.id)
    .eq('user_id', user.id)
    .single();

  if (existing) {
    return NextResponse.json({ rsvped: true, alreadyRsvped: true });
  }

  const { error } = await supabase
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

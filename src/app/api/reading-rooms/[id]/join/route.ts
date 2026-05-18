import { createClient } from '@/lib/supabase/server';
import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

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

  const { data: room } = await supabase
    .from('reading_rooms')
    .select('id, is_active, is_public')
    .eq('id', params.id)
    .single();

  if (!room) {
    return NextResponse.json({ error: 'Room not found' }, { status: 404 });
  }

  if (!room.is_active) {
    return NextResponse.json({ error: 'Room is no longer active' }, { status: 400 });
  }

  // Check if already joined
  const { data: existing } = await supabase
    .from('room_participants')
    .select('user_id')
    .eq('room_id', params.id)
    .eq('user_id', user.id)
    .single();

  if (existing) {
    return NextResponse.json({ joined: true, alreadyJoined: true });
  }

  const { error } = await supabase
    .from('room_participants')
    .insert({
      room_id: params.id,
      user_id: user.id,
    });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ joined: true });
}

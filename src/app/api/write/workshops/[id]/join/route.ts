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
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: room } = await (supabase as any)
    .from('workshop_rooms')
    .select('id, max_members, member_count')
    .eq('id', params.id)
    .single();

  if (!room) return NextResponse.json({ error: 'Room not found' }, { status: 404 });

  if ((room.member_count ?? 0) >= (room.max_members ?? 8)) {
    return NextResponse.json({ error: 'Room is full' }, { status: 409 });
  }

  // Check already a member
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: existing } = await (supabase as any)
    .from('workshop_members')
    .select('id')
    .eq('user_id', user.id)
    .eq('room_id', params.id)
    .maybeSingle();

  if (existing) return NextResponse.json({ message: 'Already a member' });

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { error } = await (supabase as any)
    .from('workshop_members')
    .insert({ user_id: user.id, room_id: params.id });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  await (supabase as any)
    .from('workshop_rooms')
    .update({ member_count: (room.member_count ?? 0) + 1 })
    .eq('id', params.id);

  return NextResponse.json({ success: true });
}

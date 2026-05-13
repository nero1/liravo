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
  const { data: buddyRead } = await (supabase as any)
    .from('buddy_reads')
    .select('id, max_participants, is_active')
    .eq('id', params.id)
    .single();

  if (!buddyRead) {
    return NextResponse.json({ error: 'Buddy read not found' }, { status: 404 });
  }

  if (!buddyRead.is_active) {
    return NextResponse.json({ error: 'This buddy read is no longer active' }, { status: 400 });
  }

  // Check if already joined
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: existing } = await (supabase as any)
    .from('buddy_read_participants')
    .select('user_id')
    .eq('buddy_read_id', params.id)
    .eq('user_id', user.id)
    .single();

  if (existing) {
    return NextResponse.json({ error: 'Already joined' }, { status: 409 });
  }

  // Check participant count
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { count } = await (supabase as any)
    .from('buddy_read_participants')
    .select('user_id', { count: 'exact', head: true })
    .eq('buddy_read_id', params.id);

  if ((count ?? 0) >= buddyRead.max_participants) {
    return NextResponse.json({ error: 'Buddy read is full' }, { status: 400 });
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { error } = await (supabase as any)
    .from('buddy_read_participants')
    .insert({
      buddy_read_id: params.id,
      user_id: user.id,
    });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ joined: true });
}

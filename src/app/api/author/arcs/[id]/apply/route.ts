import { createClient } from '@/lib/supabase/server';
import { NextResponse } from 'next/server';
import { createNotification } from '@/services/notifications';

export async function POST(
  _req: Request,
  { params }: { params: { id: string } }
) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: arc } = await (supabase as any)
    .from('arcs')
    .select('id, author_id, reader_slots, is_active')
    .eq('id', params.id)
    .single();

  if (!arc) {
    return NextResponse.json({ error: 'ARC not found' }, { status: 404 });
  }

  if (!arc.is_active) {
    return NextResponse.json({ error: 'This ARC is no longer active' }, { status: 400 });
  }

  if (arc.author_id === user.id) {
    return NextResponse.json({ error: 'You cannot apply to your own ARC' }, { status: 400 });
  }

  // Check if already applied
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: existing } = await (supabase as any)
    .from('arc_applications')
    .select('id')
    .eq('arc_id', params.id)
    .eq('reader_id', user.id)
    .single();

  if (existing) {
    return NextResponse.json({ error: 'Already applied' }, { status: 409 });
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { error } = await (supabase as any)
    .from('arc_applications')
    .insert({
      arc_id: params.id,
      reader_id: user.id,
      status: 'pending',
    });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  await createNotification({
    userId: arc.author_id,
    type: 'buddy_read_invite',
    actorId: user.id,
    entityType: 'arc',
    entityId: params.id,
    message: 'A reader applied for your ARC.',
  });

  return NextResponse.json({ applied: true });
}

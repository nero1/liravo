import { createClient } from '@/lib/supabase/server';
import { NextResponse } from 'next/server';
import { z } from 'zod';

const schema = z.object({
  current_chapter: z.number().int().min(1).optional(),
  note: z.string().min(1).max(1000).optional(),
});

export async function PATCH(
  req: Request,
  { params }: { params: { id: string } }
) {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  // Check user is a participant
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: participant } = await (supabase as any)
    .from('buddy_read_participants')
    .select('user_id')
    .eq('buddy_read_id', params.id)
    .eq('user_id', user.id)
    .single();

  if (!participant) {
    return NextResponse.json({ error: 'You are not a participant in this buddy read' }, { status: 403 });
  }

  const body = await req.json();
  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const updates: Record<string, unknown> = {};
  if (parsed.data.current_chapter !== undefined) {
    updates.current_chapter = parsed.data.current_chapter;
  }

  if (Object.keys(updates).length > 0) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await (supabase as any)
      .from('buddy_reads')
      .update(updates)
      .eq('id', params.id);
  }

  // Add note if provided
  if (parsed.data.note) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await (supabase as any)
      .from('buddy_read_notes')
      .insert({
        buddy_read_id: params.id,
        user_id: user.id,
        content: parsed.data.note,
      });
  }

  return NextResponse.json({ updated: true });
}

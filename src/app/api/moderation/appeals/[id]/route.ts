import { NextResponse } from 'next/server';
import { z } from 'zod';
import { requireModerator } from '@/lib/moderation';
import { createServiceClient } from '@/lib/supabase/server';

const patchSchema = z.object({
  status: z.enum(['approved', 'rejected']),
  note: z.string().max(500).optional(),
});

export async function PATCH(
  request: Request,
  { params }: { params: { id: string } }
) {
  const auth = await requireModerator();
  if (auth instanceof NextResponse) return auth;

  const raw = await request.json();
  const parsed = patchSchema.safeParse(raw);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? 'Invalid input' }, { status: 400 });
  }

  const supabase = createServiceClient();

  // appeals table may not be in DB type
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: appeal, error: fetchError } = await (supabase as any)
    .from('appeals')
    .select('*')
    .eq('id', params.id)
    .single();

  if (fetchError || !appeal) {
    return NextResponse.json({ error: 'Appeal not found' }, { status: 404 });
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: updated, error } = await (supabase as any)
    .from('appeals')
    .update({
      status: parsed.data.status,
      reviewed_by: auth.userId,
      reviewer_note: parsed.data.note ?? null,
      reviewed_at: new Date().toISOString(),
    })
    .eq('id', params.id)
    .select()
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  // Notify the user of the decision
  const message = parsed.data.status === 'approved'
    ? `Your appeal has been approved. ${parsed.data.note ?? ''}`
    : `Your appeal has been rejected. ${parsed.data.note ?? ''}`;

  await supabase
    .from('notifications')
    .insert({
      user_id: appeal.user_id,
      type: 'appeal_decision',
      actor_id: auth.userId,
      entity_type: 'appeal',
      entity_id: params.id,
      message,
    });

  return NextResponse.json({ appeal: updated });
}

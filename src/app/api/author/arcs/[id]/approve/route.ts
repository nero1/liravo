import { createClient } from '@/lib/supabase/server';
import { NextResponse } from 'next/server';
import { z } from 'zod';
import { createNotification } from '@/services/notifications';
import { getCurrentUser } from '@/lib/auth/getCurrentUser';

export const dynamic = 'force-dynamic';

const schema = z.object({
  applicationId: z.string().uuid(),
  approved: z.boolean(),
});

export async function POST(
  req: Request,
  { params }: { params: { id: string } }
) {
  const supabase = createClient();
  const user = await getCurrentUser();

  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { data: arc } = await supabase
    .from('arcs')
    .select('id, author_id')
    .eq('id', params.id)
    .single();

  if (!arc || arc.author_id !== user.id) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const body = await req.json();
  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const { applicationId, approved } = parsed.data;
  const newStatus = approved ? 'approved' : 'rejected';

  const { data: application, error } = await supabase
    .from('arc_applications')
    .update({ status: newStatus })
    .eq('id', applicationId)
    .eq('arc_id', params.id)
    .select()
    .single();

  if (error || !application) {
    return NextResponse.json({ error: error?.message ?? 'Application not found' }, { status: 500 });
  }

  await createNotification({
    userId: application.reader_id,
    type: 'buddy_read_invite',
    actorId: user.id,
    entityType: 'arc',
    entityId: params.id,
    message: approved
      ? 'Your ARC application has been approved!'
      : 'Your ARC application was not approved this time.',
  });

  return NextResponse.json({ application });
}

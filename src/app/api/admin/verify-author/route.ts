import { createClient } from '@/lib/supabase/server';
import { NextResponse } from 'next/server';
import { z } from 'zod';
import { createNotification } from '@/services/notifications';

const schema = z.object({
  userId: z.string().uuid(),
  approved: z.boolean(),
});

export async function POST(req: Request) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { data: admin } = await supabase
    .from('users')
    .select('is_admin')
    .eq('id', user.id)
    .single();

  if (!admin?.is_admin) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const body = await req.json();
  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const { userId, approved } = parsed.data;

  if (approved) {
    const { data: updated, error } = await supabase
      .from('users')
      .update({ is_verified_author: true } as never)
      .eq('id', userId)
      .select()
      .single();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    await createNotification({
      userId,
      type: 'author_qa_answer',
      message: 'Your author verification has been approved! You now have a verified author badge.',
    });

    return NextResponse.json({ user: updated });
  } else {
    await createNotification({
      userId,
      type: 'author_qa_answer',
      message: 'Your author verification request was not approved at this time.',
    });

    return NextResponse.json({ message: 'Verification rejected' });
  }
}

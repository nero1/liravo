import { createClient } from '@/lib/supabase/server';
import { NextResponse } from 'next/server';
import { z } from 'zod';
import { createNotification } from '@/services/notifications';
import { getCurrentUser } from '@/lib/auth/getCurrentUser';

export const dynamic = 'force-dynamic';

const schema = z.object({
  pen_name: z.string().min(1).max(100),
  publisher: z.string().max(200).optional(),
  book_titles: z.string().min(1).max(2000),
  website_url: z.string().url().optional().or(z.literal('')),
  social_proof_url: z.string().url().optional().or(z.literal('')),
});

export async function POST(req: Request) {
  const supabase = createClient();
  const user = await getCurrentUser();

  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const body = await req.json();
  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const { error } = await supabase
    .from('author_verification_requests')
    .insert({
      user_id: user.id,
      pen_name: parsed.data.pen_name,
      publisher: parsed.data.publisher ?? null,
      book_titles: parsed.data.book_titles,
      website_url: parsed.data.website_url || null,
      social_proof_url: parsed.data.social_proof_url || null,
      status: 'pending',
    });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  // Notify admins
  const { data: admins } = await supabase
    .from('users')
    .select('id')
    .eq('is_admin', true);

  for (const admin of admins ?? []) {
    await createNotification({
      userId: admin.id,
      type: 'author_qa_answer',
      actorId: user.id,
      entityType: 'author_verification_request',
      message: `A new author verification request has been submitted by a user.`,
    });
  }

  return NextResponse.json({ message: 'Verification request submitted' }, { status: 201 });
}

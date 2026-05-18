import { createClient } from '@/lib/supabase/server';
import { NextResponse } from 'next/server';
import { z } from 'zod';

export const dynamic = 'force-dynamic';

const FeedbackSchema = z.object({
  comment: z.string().min(1).max(500),
});

export async function POST(
  req: Request,
  { params }: { params: { id: string; submissionId: string } }
) {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const parsed = FeedbackSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 422 });
  }

  // Verify submission belongs to this room
  const { data: submission } = await supabase
    .from('workshop_submissions')
    .select('id')
    .eq('id', params.submissionId)
    .eq('room_id', params.id)
    .single();

  if (!submission) return NextResponse.json({ error: 'Submission not found' }, { status: 404 });

  const { data: feedback, error } = await supabase
    .from('workshop_feedback')
    .insert({
      user_id: user.id,
      submission_id: params.submissionId,
      comment: parsed.data.comment,
    })
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ feedback }, { status: 201 });
}

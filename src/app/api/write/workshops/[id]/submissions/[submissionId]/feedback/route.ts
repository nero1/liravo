import { requireWorkshopMember } from '@/lib/workshops';
import { contentIntent, ContentIntentError } from '@/lib/content-intents';
import { createClient } from '@/lib/supabase/server';
import { NextResponse } from 'next/server';
import { z } from 'zod';
import { getCurrentUser } from '@/lib/auth/getCurrentUser';

export const dynamic = 'force-dynamic';

const FeedbackSchema = z.object({
  comment: z.string().min(1).max(500),
});

export async function POST(
  req: Request,
  { params }: { params: { id: string; submissionId: string } }
) {
  const supabase = createClient();
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  try{await requireWorkshopMember(params.id,user.id);}catch(error){return NextResponse.json({error:'Workshop unavailable'},{status:error instanceof ContentIntentError?error.status:503});}


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

  let feedback;
  try {
    const intent=await contentIntent(req,user.id,'workshop_feedback',{
      user_id: user.id,
      submission_id: params.submissionId,
      comment: parsed.data.comment,
    });
    feedback = await intent.insert();
  } catch(error) {
    return NextResponse.json({error:error instanceof Error?error.message:'Content creation unavailable'},{status:error instanceof ContentIntentError?error.status:503});
  }

  return NextResponse.json({ feedback }, { status: 201 });
}

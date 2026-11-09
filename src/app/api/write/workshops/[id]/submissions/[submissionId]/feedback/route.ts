import {decodeCursor,encodeCursor,cursorFilter} from '@/lib/pagination';
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

export async function GET(request:Request, props:{params: Promise<{id:string;submissionId:string}>}) {
  const params = await props.params;
  const user=await getCurrentUser();if(!user)return NextResponse.json({error:'Unauthorized'},{status:401});
  if(request.headers.has('x-liravo-actor')&&request.headers.get('x-liravo-actor')!==user.id)return NextResponse.json({error:'Account changed',code:'ACCOUNT_CHANGED'},{status:409});
  try{await requireWorkshopMember(params.id,user.id);}catch(error){return NextResponse.json({error:'Workshop unavailable'},{status:error instanceof ContentIntentError?error.status:503});}
  if(!z.uuid().safeParse(params.submissionId).success)return NextResponse.json({error:'Invalid submission'},{status:400});
  const db=(await createClient()),submission=await db.from('workshop_submissions').select('id').eq('room_id',params.id).eq('id',params.submissionId).maybeSingle();
  if(submission.error)return NextResponse.json({error:'Submission unavailable'},{status:503});if(!submission.data)return NextResponse.json({error:'Submission not found'},{status:404});
  let cursor;try{cursor=decodeCursor(new URL(request.url).searchParams.get('cursor'));}catch{return NextResponse.json({error:'Invalid cursor'},{status:400});}
  const query=db.from('workshop_feedback').select('id,comment,created_at,user_id,users:user_id(display_name,username)').eq('submission_id',params.submissionId).order('created_at',{ascending:false}).order('id',{ascending:false}).limit(21);
  if(cursor)query.or(cursorFilter('created_at',cursor));const {data,error}=await query;if(error)return NextResponse.json({error:'Feedback unavailable'},{status:503});
  const feedback=(data??[]).slice(0,20),last=feedback.at(-1);
  return NextResponse.json({feedback,nextCursor:data?.length===21&&last?encodeCursor({at:last.created_at,id:last.id}):null},{headers:{'Cache-Control':'private, no-store'}});
}

export async function POST(
  req: Request,
  props: { params: Promise<{ id: string; submissionId: string }> }
) {
  const params = await props.params;
  const supabase = (await createClient());
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
  const { data: submission,error:submissionError } = await supabase
    .from('workshop_submissions')
    .select('id')
    .eq('id', params.submissionId)
    .eq('room_id', params.id)
    .maybeSingle();

  if(submissionError)return NextResponse.json({error:'Submission unavailable'},{status:503});
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
    if(error instanceof ContentIntentError&&error.status===409){
      const existing=await supabase.from('workshop_feedback').select('id').eq('submission_id',params.submissionId).eq('user_id',user.id).maybeSingle();
      if(!existing.error&&existing.data)return NextResponse.json({error:'Feedback already shared',code:'WORKSHOP_FEEDBACK_EXISTS'},{status:409});
    }
    return NextResponse.json({error:error instanceof Error?error.message:'Content creation unavailable'},{status:error instanceof ContentIntentError?error.status:503});
  }

  return NextResponse.json({ feedback }, { status: 201 });
}

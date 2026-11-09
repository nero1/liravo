import {decodeCursor,encodeCursor,cursorFilter} from '@/lib/pagination';
import { requireWorkshopMember } from '@/lib/workshops';
import { contentIntent, ContentIntentError } from '@/lib/content-intents';
import { createClient } from '@/lib/supabase/server';
import { NextResponse } from 'next/server';
import { z } from 'zod';
import { getCurrentUser } from '@/lib/auth/getCurrentUser';

export const dynamic = 'force-dynamic';

const SubmitSchema = z.object({
  title: z.string().trim().min(1).max(200),
  excerpt: z.string().trim().min(1).max(1000),
  word_count: z.number().int().min(0).optional(),
});

export async function GET(request:Request, props:{params: Promise<{id:string}>}) {
  const params = await props.params;
  const user=await getCurrentUser();if(!user)return NextResponse.json({error:'Unauthorized'},{status:401});
  if(request.headers.has('x-liravo-actor')&&request.headers.get('x-liravo-actor')!==user.id)return NextResponse.json({error:'Account changed',code:'ACCOUNT_CHANGED'},{status:409});
  try{await requireWorkshopMember(params.id,user.id);}catch(error){return NextResponse.json({error:'Workshop unavailable'},{status:error instanceof ContentIntentError?error.status:503});}
  let cursor;try{cursor=decodeCursor(new URL(request.url).searchParams.get('cursor'));}catch{return NextResponse.json({error:'Invalid cursor'},{status:400});}
  const query=(await createClient()).from('workshop_submissions').select('id,title,excerpt,word_count,created_at,user_id,users:user_id(display_name,username)').eq('room_id',params.id).order('created_at',{ascending:false}).order('id',{ascending:false}).limit(21);
  if(cursor)query.or(cursorFilter('created_at',cursor));
  const {data,error}=await query;if(error)return NextResponse.json({error:'Submissions unavailable'},{status:503});
  const submissions=(data??[]).slice(0,20),last=submissions.at(-1);
  return NextResponse.json({submissions,nextCursor:data?.length===21&&last?encodeCursor({at:last.created_at,id:last.id}):null},{headers:{'Cache-Control':'private, no-store'}});
}

export async function POST(req: Request, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  try{await requireWorkshopMember(params.id,user.id);}catch(error){return NextResponse.json({error:'Workshop unavailable'},{status:error instanceof ContentIntentError?error.status:503});}


  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const parsed = SubmitSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 422 });
  }

  let submission;
  try {
    const intent=await contentIntent(req,user.id,'workshop_submissions',{
      user_id: user.id,
      room_id: params.id,
      title: parsed.data.title,
      excerpt: parsed.data.excerpt,
    });
    submission = await intent.insert();
  } catch(error) {
    return NextResponse.json({error:error instanceof Error?error.message:'Content creation unavailable'},{status:error instanceof ContentIntentError?error.status:503});
  }

  return NextResponse.json({ submission }, { status: 201 });
}

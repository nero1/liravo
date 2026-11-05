import {decodeBuddyCursor,getBuddyNotes} from '@/lib/buddy-reads';
import { contentIntent, ContentIntentError } from '@/lib/content-intents';
import { createClient } from '@/lib/supabase/server';
import { NextResponse } from 'next/server';
import { z } from 'zod';
import { getCurrentUser } from '@/lib/auth/getCurrentUser';

export const dynamic = 'force-dynamic';

export async function GET(request:Request,{params}:{params:{id:string}}){
  if(!z.string().uuid().safeParse(params.id).success)return NextResponse.json({error:'Invalid buddy read'},{status:400});
  const user=await getCurrentUser();if(!user)return NextResponse.json({error:'Unauthorized'},{status:401});
  const actor=request.headers.get('X-Liravo-Actor');if(actor&&actor!==user.id)return NextResponse.json({error:'Account changed'},{status:409});
  const cursor=new URL(request.url).searchParams.get('cursor');try{decodeBuddyCursor(cursor,user.id,'notes.'+params.id);}catch{return NextResponse.json({error:'Invalid cursor'},{status:400});}
  try{return NextResponse.json(await getBuddyNotes(user.id,params.id,cursor),{headers:{'Cache-Control':'private, no-store'}});}
  catch(error){return NextResponse.json({error:'Notes unavailable'},{status:(error as {status?:number}).status??503});}
}

const NoteSchema = z.object({
  content: z.string().trim().min(1).max(2000),
  reply_to_id: z.string().uuid().nullable().optional(),
});

export async function POST(
  req: Request,
  { params }: { params: { id: string } }
) {
  if(!z.string().uuid().safeParse(params.id).success)return NextResponse.json({error:'Invalid buddy read'},{status:400});
  const supabase = createClient();
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  // Verify participant
  const { data: participant,error:membershipError } = await supabase
    .from('buddy_read_members')
    .select('user_id')
    .eq('buddy_read_id', params.id)
    .eq('user_id', user.id)
    .maybeSingle();

  if(membershipError)return NextResponse.json({error:'Membership unavailable'},{status:503});
  if (!participant) return NextResponse.json({ error: 'Not a participant' }, { status: 403 });

  let body: unknown;
  try { body = await req.json(); } catch { return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 }); }

  const parsed = NoteSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: 'Invalid body' }, { status: 400 });

  let note;
  try {
    const intent=await contentIntent(req,user.id,'buddy_read_notes',{
      buddy_read_id: params.id,
      user_id: user.id,
      content: parsed.data.content,
      reply_to_id: parsed.data.reply_to_id ?? null,
    });
    note = await intent.insert();
  } catch(error) {
    return NextResponse.json({error:error instanceof Error?error.message:'Content creation unavailable'},{status:error instanceof ContentIntentError?error.status:503});
  }

  return NextResponse.json({ note,actorId:user.id,roomId:params.id }, { status: 201 });
}

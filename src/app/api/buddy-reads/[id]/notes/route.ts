import { contentIntent, ContentIntentError } from '@/lib/content-intents';
import { createClient } from '@/lib/supabase/server';
import { NextResponse } from 'next/server';
import { z } from 'zod';
import { getCurrentUser } from '@/lib/auth/getCurrentUser';

export const dynamic = 'force-dynamic';

export async function GET(
  _req: Request,
  { params }: { params: { id: string } }
) {
  const supabase = createClient();
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const {data:member,error:membershipError}=await supabase.from('buddy_read_members').select('user_id').eq('buddy_read_id',params.id).eq('user_id',user.id).maybeSingle();
  if(membershipError)return NextResponse.json({error:'Membership unavailable'},{status:503});
  if(!member)return NextResponse.json({error:'Not a participant'},{status:403});

  const { data: notes, error } = await supabase
    .from('buddy_read_notes')
    .select(`
      id, user_id, content, created_at, reply_to_id,
      user:user_id (display_name, username, avatar_url)
    `)
    .eq('buddy_read_id', params.id)
    .order('created_at', { ascending: false })
    .limit(100);

  if(error)return NextResponse.json({error:'Notes unavailable'},{status:503});
  return NextResponse.json({ notes: notes ?? [] });
}

const NoteSchema = z.object({
  content: z.string().min(1).max(2000),
  reply_to_id: z.string().uuid().nullable().optional(),
});

export async function POST(
  req: Request,
  { params }: { params: { id: string } }
) {
  const supabase = createClient();
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  // Verify participant
  const { data: participant } = await supabase
    .from('buddy_read_members')
    .select('user_id')
    .eq('buddy_read_id', params.id)
    .eq('user_id', user.id)
    .single();

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

  return NextResponse.json({ note }, { status: 201 });
}

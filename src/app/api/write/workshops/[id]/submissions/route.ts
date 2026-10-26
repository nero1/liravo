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

export async function GET(
  _req: Request,
  { params }: { params: { id: string } }
) {
  const user=await getCurrentUser();if(!user)return NextResponse.json({error:'Unauthorized'},{status:401});
  try{await requireWorkshopMember(params.id,user.id);}catch(error){return NextResponse.json({error:'Workshop unavailable'},{status:error instanceof ContentIntentError?error.status:503});}
  const supabase = createClient();

  const { data, error } = await supabase
    .from('workshop_submissions')
    .select('id, title, excerpt, word_count, created_at, user_id, users:user_id(display_name, username)')
    .eq('room_id', params.id)
    .order('created_at', { ascending: false });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ submissions: data ?? [] });
}

export async function POST(
  req: Request,
  { params }: { params: { id: string } }
) {
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

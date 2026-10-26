import { contentIntent, ContentIntentError } from '@/lib/content-intents';
import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { z } from 'zod';
import { getCurrentUser } from '@/lib/auth/getCurrentUser';

export const dynamic = 'force-dynamic';


const PassBookSchema = z.object({
  book_id: z.string().uuid(),
  recipient_id: z.string().uuid(),
  message: z.string().max(500).optional(),
});

export async function POST(request: NextRequest) {
  const user = await getCurrentUser();

  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const parsed = PassBookSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: 'Invalid body', details: parsed.error.flatten() }, { status: 400 });
  }

  try {
    const intent=await contentIntent(request,user.id,'book_passes',{book_id:parsed.data.book_id,recipient_id:parsed.data.recipient_id,message:parsed.data.message??null});
    const pass=await intent.insert();
    return NextResponse.json({success:true,pass},{status:201});
  }catch(error){
    return NextResponse.json({error:error instanceof Error?error.message:'Book pass unavailable'},{status:error instanceof ContentIntentError?error.status:503});
  }
}

export async function GET() {
  const supabase = createClient();
  const user = await getCurrentUser();

  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  // Get passes from book_passes table if it exists
  const { data: receivedPasses } = await supabase 
    .from('book_passes')
    .select('id, sender_id, book_id, message, created_at')
    .eq('recipient_id', user.id)
    .order('created_at', { ascending: false })
    .limit(20);

  const { data: sentPasses } = await supabase 
    .from('book_passes')
    .select('id, recipient_id, book_id, message, created_at')
    .eq('sender_id', user.id)
    .order('created_at', { ascending: false })
    .limit(20);

  return NextResponse.json({
    received: receivedPasses ?? [],
    sent: sentPasses ?? [],
  });
}

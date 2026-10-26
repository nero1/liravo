import { contentIntent, ContentIntentError } from '@/lib/content-intents';
import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { z } from 'zod';
import { getCurrentUser } from '@/lib/auth/getCurrentUser';

export const dynamic = 'force-dynamic';

// book_debates table not in generated types — using any cast
// Expected columns: id, book_id, user_id, question, yes_count, no_count, is_active, created_at

const CreateDebateSchema = z.object({
  book_id: z.string().uuid(),
  question: z.string().min(5).max(200),
});

export async function GET() {
  const supabase = createClient();

  const { data: debates, error } = await supabase
    .from('book_debates')
    .select('id, book_id, user_id, question, yes_count, no_count, is_active, created_at')
    .eq('is_active', true)
    .order('created_at', { ascending: false })
    .limit(50);

  if (error) {
    return NextResponse.json({error:'Debates unavailable'},{status:503});
  }

  return NextResponse.json({ debates: debates ?? [] });
}

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

  const parsed = CreateDebateSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: 'Invalid body', details: parsed.error.flatten() }, { status: 400 });
  }

  let debate;
  try {
    const intent=await contentIntent(request,user.id,'book_debates',{
      book_id: parsed.data.book_id,
      user_id: user.id,
      question: parsed.data.question,
      yes_count: 0,
      no_count: 0,
      is_active: true,
    });
    debate = await intent.insert();
  } catch(error) {
    return NextResponse.json({error:error instanceof Error?error.message:'Content creation unavailable'},{status:error instanceof ContentIntentError?error.status:503});
  }

  return NextResponse.json({ debate }, { status: 201 });
}

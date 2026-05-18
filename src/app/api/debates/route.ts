import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { z } from 'zod';

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
    return NextResponse.json({ debates: [] });
  }

  return NextResponse.json({ debates: debates ?? [] });
}

export async function POST(request: NextRequest) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();

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

  const { data: debate, error } = await supabase 
    .from('book_debates')
    .insert({
      book_id: parsed.data.book_id,
      user_id: user.id,
      question: parsed.data.question,
      yes_count: 0,
      no_count: 0,
      is_active: true,
    })
    .select()
    .single();

  if (error) {
    return NextResponse.json({ error: 'Failed to create debate' }, { status: 500 });
  }

  return NextResponse.json({ debate }, { status: 201 });
}

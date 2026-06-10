import { createClient } from '@/lib/supabase/server';
import { NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/auth/getCurrentUser';

export const dynamic = 'force-dynamic';

// GET /api/author/qa/pending — author fetches unanswered questions from their fans
export async function GET() {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const supabase = createClient();
  const { data: profile } = await supabase
    .from('users')
    .select('is_verified_author, user_types')
    .eq('id', user.id)
    .single();

  const isAuthor =
    profile?.is_verified_author ||
    (profile?.user_types ?? []).includes('author');

  if (!isAuthor) return NextResponse.json({ error: 'Author access required' }, { status: 403 });

  const { data, error } = await supabase
    .from('author_qa')
    .select('id, question, answer, asked_by, created_at, answered_at')
    .eq('author_id', user.id)
    .order('created_at', { ascending: false })
    .limit(50);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ qa: data ?? [] });
}

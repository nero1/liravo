import { createClient } from '@/lib/supabase/server';
import { NextResponse } from 'next/server';
import { z } from 'zod';
import { sanitizeText, sanitizeRichText } from '@/lib/sanitize';
import { getCurrentUser } from '@/lib/auth/getCurrentUser';

export const dynamic = 'force-dynamic';

const postSchema = z.object({
  title: z.string().min(1).max(200),
  body: z.string().min(1).max(2000),
  book_id: z.string().uuid().optional(),
  type: z.enum(['announcement', 'blog', 'arc_invite']),
});

export async function GET(req: Request) {
  const supabase = createClient();
  const { searchParams } = new URL(req.url);
  const authorId = searchParams.get('authorId');

  if (!authorId) {
    return NextResponse.json({ error: 'authorId required' }, { status: 400 });
  }

  const { data, error } = await supabase
    .from('author_posts')
    .select('id, title, body, type, book_id, author_id, created_at')
    .eq('author_id', authorId)
    .order('created_at', { ascending: false })
    .limit(20);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ posts: data ?? [] });
}

export async function POST(req: Request) {
  const supabase = createClient();
  const user = await getCurrentUser();

  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { data: profile } = await supabase
    .from('users')
    .select('is_verified_author, user_types')
    .eq('id', user.id)
    .single();

  const isAuthor =
    profile?.is_verified_author ||
    (profile?.user_types ?? []).includes('author');

  if (!isAuthor) {
    return NextResponse.json({ error: 'Author access required' }, { status: 403 });
  }

  const body = await req.json();
  const parsed = postSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const { data, error } = await supabase
    .from('author_posts')
    .insert({
      author_id: user.id,
      title: sanitizeText(parsed.data.title),
      body: sanitizeRichText(parsed.data.body),
      book_id: parsed.data.book_id ?? null,
      type: parsed.data.type,
    })
    .select()
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ post: data }, { status: 201 });
}

import { contentIntent, ContentIntentError } from '@/lib/content-intents';
import { createClient } from '@/lib/supabase/server';
import { NextResponse } from 'next/server';
import { z } from 'zod';
import { sanitizeText } from '@/lib/sanitize';
import { getCurrentUser } from '@/lib/auth/getCurrentUser';

export const dynamic = 'force-dynamic';

const submitSchema = z.object({
  author_id: z.string().uuid(),
  question: z.string().min(10).max(500),
});

// GET /api/author/qa?author_id=... — list public answered Q&A for an author
export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const authorId = searchParams.get('author_id');
  if (!authorId) return NextResponse.json({ error: 'author_id required' }, { status: 400 });

  const supabase = createClient();
  const { data, error } = await supabase
    .from('author_qa')
    .select('id, question, answer, answered_at, created_at, asked_by')
    .eq('author_id', authorId)
    .eq('is_public', true)
    .not('answer', 'is', null)
    .order('answered_at', { ascending: false })
    .limit(20);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ qa: data ?? [] });
}

// POST /api/author/qa — fan submits a question
export async function POST(req: Request) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  let body: unknown;
  try { body = await req.json(); } catch { return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 }); }

  const parsed = submitSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 422 });

  const supabase = createClient();

  // Confirm the target is actually a verified author
  const { data: authorProfile } = await supabase
    .from('users')
    .select('is_verified_author, user_types, display_name')
    .eq('id', parsed.data.author_id)
    .single();

  const isAuthor =
    authorProfile?.is_verified_author ||
    (authorProfile?.user_types ?? []).includes('author');

  if (!isAuthor) return NextResponse.json({ error: 'Target user is not an author' }, { status: 404 });

  let qa;
  try {
    const intent=await contentIntent(req,user.id,'author_qa',{
      author_id: parsed.data.author_id,
      asked_by: user.id,
      question: sanitizeText(parsed.data.question),
      is_public: true,
    });
    qa = await intent.insert();
  } catch(error) {
    return NextResponse.json({error:error instanceof Error?error.message:'Content creation unavailable'},{status:error instanceof ContentIntentError?error.status:503});
  }

  return NextResponse.json({ qa }, { status: 201 });
}

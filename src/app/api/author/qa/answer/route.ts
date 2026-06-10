import { createClient, createServiceClient } from '@/lib/supabase/server';
import { NextResponse } from 'next/server';
import { z } from 'zod';
import { sanitizeRichText } from '@/lib/sanitize';
import { getCurrentUser } from '@/lib/auth/getCurrentUser';

export const dynamic = 'force-dynamic';

const answerSchema = z.object({
  qa_id: z.string().uuid(),
  answer: z.string().min(1).max(2000),
});

// POST /api/author/qa/answer — author answers a question
export async function POST(req: Request) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const supabase = createClient();
  const { data: profile } = await supabase
    .from('users')
    .select('is_verified_author, user_types, display_name')
    .eq('id', user.id)
    .single();

  const isAuthor =
    profile?.is_verified_author ||
    (profile?.user_types ?? []).includes('author');

  if (!isAuthor) return NextResponse.json({ error: 'Author access required' }, { status: 403 });

  let body: unknown;
  try { body = await req.json(); } catch { return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 }); }

  const parsed = answerSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 422 });

  // Verify this QA belongs to the current author
  const { data: qa } = await supabase
    .from('author_qa')
    .select('id, asked_by, question')
    .eq('id', parsed.data.qa_id)
    .eq('author_id', user.id)
    .single();

  if (!qa) return NextResponse.json({ error: 'Question not found or not yours' }, { status: 404 });

  const { error } = await supabase
    .from('author_qa')
    .update({
      answer: sanitizeRichText(parsed.data.answer),
      answered_at: new Date().toISOString(),
    })
    .eq('id', parsed.data.qa_id);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // Notify the asker
  if (qa.asked_by) {
    try {
      const serviceSupabase = createServiceClient();
      await serviceSupabase.from('notifications').insert({
        user_id: qa.asked_by,
        type: 'author_qa_answer',
        actor_id: user.id,
        entity_type: 'author_qa',
        entity_id: qa.id,
        message: `${profile?.display_name ?? 'The author'} answered your question: ${qa.question.slice(0, 60)}…`,
      });
    } catch { /* non-critical */ }
  }

  return NextResponse.json({ ok: true });
}

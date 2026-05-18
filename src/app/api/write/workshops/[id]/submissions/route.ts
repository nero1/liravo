import { createClient } from '@/lib/supabase/server';
import { NextResponse } from 'next/server';
import { z } from 'zod';
import { checkAndAwardBadges } from '@/services/badges';

export const dynamic = 'force-dynamic';

const SubmitSchema = z.object({
  title: z.string().min(1).max(200),
  excerpt: z.string().min(1).max(1000),
  word_count: z.number().int().min(0).optional(),
});

export async function GET(
  _req: Request,
  { params }: { params: { id: string } }
) {
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
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

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

  const { data: submission, error } = await supabase
    .from('workshop_submissions')
    .insert({
      user_id: user.id,
      room_id: params.id,
      title: parsed.data.title,
      excerpt: parsed.data.excerpt,
      word_count: parsed.data.word_count ?? 0,
    })
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // Check workshop veteran badge
  await checkAndAwardBadges(user.id, 'workshop_submit');

  return NextResponse.json({ submission }, { status: 201 });
}

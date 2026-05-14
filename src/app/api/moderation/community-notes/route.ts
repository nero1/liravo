import { NextResponse } from 'next/server';
import { z } from 'zod';
import { createClient } from '@/lib/supabase/server';
import { createServiceClient } from '@/lib/supabase/server';
import { requireModerator } from '@/lib/moderation';

const noteSubmitSchema = z.object({
  content_type: z.enum(['review', 'quote', 'profile', 'debate']),
  content_id: z.string().uuid(),
  note: z.string().min(10).max(500),
});

const notePatchSchema = z.object({
  status: z.enum(['approved', 'rejected']),
});

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const contentType = searchParams.get('contentType');
  const contentId = searchParams.get('contentId');

  if (!contentType || !contentId) {
    return NextResponse.json({ error: 'contentType and contentId are required' }, { status: 400 });
  }

  const supabase = createServiceClient();

  // community_notes table may not be in DB type
  const { data: notes, error } = await supabase
    .from('community_notes')
    .select('id, note, created_at, author_id')
    .eq('content_type', contentType)
    .eq('content_id', contentId)
    .eq('status', 'approved')
    .order('created_at', { ascending: false });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ notes: notes ?? [] });
}

export async function POST(request: Request) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const raw = await request.json();
  const parsed = noteSubmitSchema.safeParse(raw);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? 'Invalid input' }, { status: 400 });
  }

  const serviceSupabase = createServiceClient();

  // community_notes table may not be in DB type
  const { data, error } = await serviceSupabase
    .from('community_notes')
    .insert({
      author_id: user.id,
      content_type: parsed.data.content_type,
      content_id: parsed.data.content_id,
      note: parsed.data.note,
      status: 'pending',
      created_at: new Date().toISOString(),
    })
    .select()
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ note: data }, { status: 201 });
}

export async function PATCH(request: Request) {
  const auth = await requireModerator();
  if (auth instanceof NextResponse) return auth;

  const { searchParams } = new URL(request.url);
  const noteId = searchParams.get('noteId');
  if (!noteId) {
    return NextResponse.json({ error: 'noteId is required' }, { status: 400 });
  }

  const raw = await request.json();
  const parsed = notePatchSchema.safeParse(raw);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? 'Invalid input' }, { status: 400 });
  }

  const supabase = createServiceClient();

  // community_notes table may not be in DB type
  const { data, error } = await supabase
    .from('community_notes')
    .update({
      status: parsed.data.status,
      reviewed_by: auth.userId,
      reviewed_at: new Date().toISOString(),
    })
    .eq('id', noteId)
    .select()
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ note: data });
}

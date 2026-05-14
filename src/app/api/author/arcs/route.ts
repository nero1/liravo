import { createClient } from '@/lib/supabase/server';
import { NextResponse } from 'next/server';
import { z } from 'zod';

const arcSchema = z.object({
  book_id: z.string().uuid(),
  description: z.string().min(1).max(1000),
  reader_slots: z.number().int().min(1).max(20),
  close_date: z.string().datetime().optional(),
});

export async function GET(req: Request) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { searchParams } = new URL(req.url);
  const authorId = searchParams.get('authorId') ?? user.id;

  const { data, error } = await supabase
    .from('arcs')
    .select('id, book_id, description, reader_slots, close_date, is_active, created_at')
    .eq('author_id', authorId)
    .order('created_at', { ascending: false });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ arcs: data ?? [] });
}

export async function POST(req: Request) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();

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
  const parsed = arcSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const { data, error } = await supabase
    .from('arcs')
    .insert({
      author_id: user.id,
      book_id: parsed.data.book_id,
      description: parsed.data.description,
      reader_slots: parsed.data.reader_slots,
      close_date: parsed.data.close_date ?? null,
      is_active: true,
    })
    .select()
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ arc: data }, { status: 201 });
}

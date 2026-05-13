import { createClient } from '@/lib/supabase/server';
import { NextResponse } from 'next/server';
import { z } from 'zod';

const createSchema = z.object({
  name: z.string().min(1).max(100),
  book_id: z.string().uuid().optional(),
  is_public: z.boolean().default(true),
});

export async function GET() {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data, error } = await (supabase as any)
    .from('reading_rooms')
    .select('id, name, book_id, is_public, created_by, is_active, created_at')
    .eq('is_active', true)
    .order('created_at', { ascending: false })
    .limit(30);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ rooms: data ?? [] });
}

export async function POST(req: Request) {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const body = await req.json();
  const parsed = createSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: room, error } = await (supabase as any)
    .from('reading_rooms')
    .insert({
      name: parsed.data.name,
      book_id: parsed.data.book_id ?? null,
      is_public: parsed.data.is_public,
      created_by: user.id,
      is_active: true,
    })
    .select()
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  // Add creator as first participant
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  await (supabase as any)
    .from('room_participants')
    .insert({
      room_id: room.id,
      user_id: user.id,
    });

  return NextResponse.json({ room }, { status: 201 });
}

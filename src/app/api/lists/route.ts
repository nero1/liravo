import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { z } from 'zod';

// reading_lists table not in generated types — using any cast with comment
// Expected columns: id, user_id, name, description, is_public, created_at, updated_at

const CreateListSchema = z.object({
  name: z.string().min(1).max(100),
  description: z.string().max(500).optional(),
  is_public: z.boolean().default(true),
});

export async function GET() {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  // Get user's own lists
  const { data: ownLists, error: ownError } = await supabase 
    .from('reading_lists')
    .select('id, user_id, name, description, is_public, created_at, updated_at')
    .eq('user_id', user.id)
    .order('created_at', { ascending: false });

  if (ownError) {
    return NextResponse.json({ error: 'Failed to fetch lists' }, { status: 500 });
  }

  // Get followed lists
  const { data: followedRelations } = await supabase 
    .from('reading_list_follows')
    .select('list_id')
    .eq('user_id', user.id);

  const followedIds = (followedRelations ?? []).map((r: { list_id: string }) => r.list_id);
  let followedLists: unknown[] = [];

  if (followedIds.length > 0) {
    const { data } = await supabase 
      .from('reading_lists')
      .select('id, user_id, name, description, is_public, created_at, updated_at')
      .in('id', followedIds);
    followedLists = data ?? [];
  }

  return NextResponse.json({
    lists: ownLists ?? [],
    followedLists,
  });
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

  const parsed = CreateListSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: 'Invalid body', details: parsed.error.flatten() }, { status: 400 });
  }

  const { data: list, error } = await supabase 
    .from('reading_lists')
    .insert({
      user_id: user.id,
      name: parsed.data.name,
      description: parsed.data.description ?? null,
      is_public: parsed.data.is_public,
    })
    .select()
    .single();

  if (error) {
    return NextResponse.json({ error: 'Failed to create list' }, { status: 500 });
  }

  return NextResponse.json({ list }, { status: 201 });
}

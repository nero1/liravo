import { createClient } from '@/lib/supabase/server';
import { NextResponse } from 'next/server';
import { z } from 'zod';
import { getCurrentUser } from '@/lib/auth/getCurrentUser';

export const dynamic = 'force-dynamic';

const PostSchema = z.object({
  content: z.string().min(1).max(2000),
  milestone_id: z.string().uuid().optional().nullable(),
});

export async function GET(
  _req: Request,
  { params }: { params: { id: string } }
) {
  const supabase = createClient();
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { data, error } = await supabase
    .from('reading_room_posts')
    .select('id, content, milestone_id, created_at, users:user_id(id, display_name, username, avatar_url)')
    .eq('room_id', params.id)
    .order('created_at', { ascending: true })
    .limit(100);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ posts: data ?? [] });
}

export async function POST(
  req: Request,
  { params }: { params: { id: string } }
) {
  const supabase = createClient();
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  // Verify user is a member or creator
  const [{ data: room }, { data: membership }] = await Promise.all([
    supabase.from('reading_rooms').select('created_by, is_active').eq('id', params.id).single(),
    supabase.from('room_participants').select('user_id').eq('room_id', params.id).eq('user_id', user.id).maybeSingle(),
  ]);

  if (!room) return NextResponse.json({ error: 'Room not found' }, { status: 404 });
  if (!room.is_active) return NextResponse.json({ error: 'Room is closed' }, { status: 400 });
  if (room.created_by !== user.id && !membership) {
    return NextResponse.json({ error: 'Join the room to post' }, { status: 403 });
  }

  let body: unknown;
  try { body = await req.json(); } catch { return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 }); }

  const parsed = PostSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 422 });

  // If milestone_id provided, check unlock_date hasn't passed the lock
  if (parsed.data.milestone_id) {
    const { data: milestone } = await supabase
      .from('reading_room_milestones')
      .select('unlock_date')
      .eq('id', parsed.data.milestone_id)
      .eq('room_id', params.id)
      .single();

    if (!milestone) return NextResponse.json({ error: 'Milestone not found' }, { status: 404 });
    if (new Date(milestone.unlock_date) > new Date()) {
      return NextResponse.json({ error: 'This milestone discussion is locked until ' + new Date(milestone.unlock_date).toLocaleDateString() }, { status: 403 });
    }
  }

  const { data, error } = await supabase
    .from('reading_room_posts')
    .insert({
      room_id: params.id,
      user_id: user.id,
      content: parsed.data.content,
      milestone_id: parsed.data.milestone_id ?? null,
    })
    .select('id, content, milestone_id, created_at, users:user_id(id, display_name, username, avatar_url)')
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ post: data }, { status: 201 });
}

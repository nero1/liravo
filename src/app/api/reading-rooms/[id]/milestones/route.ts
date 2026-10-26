import { contentIntent, ContentIntentError, requireReadingRoomAccess } from '@/lib/content-intents';
import { createClient } from '@/lib/supabase/server';
import { NextResponse } from 'next/server';
import { z } from 'zod';
import { getCurrentUser } from '@/lib/auth/getCurrentUser';

export const dynamic = 'force-dynamic';

const MilestoneSchema = z.object({
  title: z.string().min(1).max(200),
  unlock_date: z.string().datetime(),
});

export async function GET(
  _req: Request,
  { params }: { params: { id: string } }
) {
  const supabase = createClient();
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  try{await requireReadingRoomAccess(params.id,user.id);}catch(error){return NextResponse.json({error:'Room unavailable'},{status:error instanceof ContentIntentError?error.status:503});}

  const { data, error } = await supabase
    .from('reading_room_milestones')
    .select('id, title, unlock_date, created_at')
    .eq('room_id', params.id)
    .order('unlock_date', { ascending: true });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ milestones: data ?? [] });
}

export async function POST(
  req: Request,
  { params }: { params: { id: string } }
) {
  const supabase = createClient();
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { data: room } = await supabase
    .from('reading_rooms')
    .select('created_by')
    .eq('id', params.id)
    .single();

  if (!room) return NextResponse.json({ error: 'Room not found' }, { status: 404 });
  if (room.created_by !== user.id) {
    return NextResponse.json({ error: 'Only the room creator can add milestones' }, { status: 403 });
  }

  let body: unknown;
  try { body = await req.json(); } catch { return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 }); }

  const parsed = MilestoneSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 422 });

  let data;
  try {
    const intent=await contentIntent(req,user.id,'reading_room_milestones',{ room_id: params.id, title: parsed.data.title, unlock_date: parsed.data.unlock_date });
    data = await intent.insert();
  } catch(error) {
    return NextResponse.json({error:error instanceof Error?error.message:'Content creation unavailable'},{status:error instanceof ContentIntentError?error.status:503});
  }

  return NextResponse.json({ milestone: data }, { status: 201 });
}

export async function DELETE(
  req: Request,
  { params }: { params: { id: string } }
) {
  const supabase = createClient();
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const url = new URL(req.url);
  const milestoneId = url.searchParams.get('milestone_id');
  if (!milestoneId) return NextResponse.json({ error: 'milestone_id required' }, { status: 400 });

  const { data: roomData } = await supabase.from('reading_rooms').select('created_by').eq('id', params.id).single();
  if (!roomData || roomData.created_by !== user.id) {
    return NextResponse.json({ error: 'Only the room creator can delete milestones' }, { status: 403 });
  }

  const { error } = await supabase.from('reading_room_milestones').delete().eq('id', milestoneId).eq('room_id', params.id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ deleted: true });
}

import { contentIntent, ContentIntentError } from '@/lib/content-intents';
import { createClient } from '@/lib/supabase/server';
import { NextResponse } from 'next/server';
import { z } from 'zod';
import { getCurrentUser } from '@/lib/auth/getCurrentUser';

export const dynamic = 'force-dynamic';

const CreateRoomSchema = z.object({
  name: z.string().min(3).max(100),
  topic: z.string().max(200).optional(),
  max_members: z.number().int().min(3).max(8),
});

export async function GET() {
  const supabase = createClient();

  const { data, error } = await supabase
    .from('workshop_rooms')
    .select('*, facilitator:facilitator_id(display_name, username)')
    .eq('is_active', true)
    .order('created_at', { ascending: false });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ rooms: data ?? [] });
}

export async function POST(req: Request) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const parsed = CreateRoomSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 422 });
  }

  let data;
  try {
    const intent=await contentIntent(req,user.id,'workshop_rooms',{
      ...parsed.data,
      facilitator_id: user.id,
      is_active: true,
    });
    data = await intent.insert();
  } catch(error) {
    return NextResponse.json({error:error instanceof Error?error.message:'Content creation unavailable'},{status:error instanceof ContentIntentError?error.status:503});
  }

  return NextResponse.json({ room: data }, { status: 201 });
}

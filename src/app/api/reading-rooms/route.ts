import { contentIntent, ContentIntentError } from '@/lib/content-intents';
import { createClient } from '@/lib/supabase/server';
import { NextResponse } from 'next/server';
import { z } from 'zod';
import { getCurrentUser } from '@/lib/auth/getCurrentUser';

export const dynamic = 'force-dynamic';

const createSchema = z.object({
  name: z.string().min(1).max(100),
  book_id: z.string().uuid().optional(),
  is_public: z.boolean().default(true),
});

export async function GET() {
  const supabase = createClient();
  const user = await getCurrentUser();

  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { data, error } = await supabase
    .from('reading_rooms')
    .select('id, name, book_id, is_public, created_by, is_active, created_at')
    .eq('is_active', true)
    .eq('is_public',true)
    .order('created_at', { ascending: false })
    .limit(30);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ rooms: data ?? [] });
}

export async function POST(req: Request) {
  const user = await getCurrentUser();

  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const body = await req.json();
  const parsed = createSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  let room;
  try {
    const intent=await contentIntent(req,user.id,'reading_rooms',{
      name: parsed.data.name,
      book_id: parsed.data.book_id ?? null,
      is_public: parsed.data.is_public,
      created_by: user.id,
      is_active: true,
    });
    room = await intent.insert();
  } catch(error) {
    return NextResponse.json({error:error instanceof Error?error.message:'Content creation unavailable'},{status:error instanceof ContentIntentError?error.status:503});
  }

  return NextResponse.json({ room }, { status: 201 });
}

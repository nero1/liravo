import { contentIntent, ContentIntentError } from '@/lib/content-intents';
import { decodeCursor, encodeCursor, cursorFilter } from '@/lib/pagination';
import { NextRequest, NextResponse } from 'next/server';
import { createClient, createServiceClient } from '@/lib/supabase/server';
import { z } from 'zod';
import { getCurrentUser } from '@/lib/auth/getCurrentUser';

export const dynamic = 'force-dynamic';

// reading_lists table not in generated types — using any cast with comment
// Expected columns: id, user_id, name, description, is_public, created_at, updated_at

const CreateListSchema = z.object({
  name: z.string().min(1).max(100),
  description: z.string().max(500).optional(),
  is_public: z.boolean().default(true),
});

export async function GET(request: Request) {
  const supabase = createClient();
  const user = await getCurrentUser();

  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  let cursor, followedCursor;
  try {
    const query = new URL(request.url).searchParams;
    cursor = decodeCursor(query.get('cursor'));
    followedCursor = decodeCursor(query.get('followedCursor'));
  }
  catch { return NextResponse.json({ error: 'Invalid cursor' }, { status: 400 }); }
  // Get user's own lists
  const ownQuery = supabase
    .from('reading_lists')
    .select('id, user_id, name, description, is_public, created_at, updated_at')
    .eq('user_id', user.id)
    .order('created_at', { ascending: false }).order('id', { ascending: false }).limit(51);
  if (cursor) ownQuery.or(cursorFilter('created_at', cursor));
  const { data: ownLists, error: ownError } = await ownQuery;

  if (ownError) {
    return NextResponse.json({ error: 'Failed to fetch lists' }, { status: 500 });
  }

  const { data, error: followedError } = await createServiceClient().rpc('page_followed_lists' as never, {
    p_user_id: user.id, p_before: followedCursor?.at ?? null,
    p_before_id: followedCursor?.id ?? null, p_limit: 51,
  } as never);
  if (followedError) return NextResponse.json({ error: 'Failed to fetch followed lists' }, { status: 503 });
  const followedLists = (data ?? []) as Array<{ id: string; created_at: string }>;

  return NextResponse.json({
    lists: (ownLists ?? []).slice(0, 50),
    nextCursor: ownLists?.length === 51 ? encodeCursor({ at: ownLists[49].created_at, id: ownLists[49].id }) : null,
    followedLists: followedLists.slice(0, 50),
    nextFollowedCursor: followedLists.length === 51 ? encodeCursor({ at: followedLists[49].created_at, id: followedLists[49].id }) : null,
  });
}

export async function POST(request: NextRequest) {
  const user = await getCurrentUser();

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

  let list;
  try {
    const intent=await contentIntent(request,user.id,'reading_lists',{
      user_id: user.id,
      name: parsed.data.name,
      description: parsed.data.description ?? null,
      is_public: parsed.data.is_public,
    });
    list = await intent.insert();
  } catch(error) {
    return NextResponse.json({error:error instanceof Error?error.message:'Content creation unavailable'},{status:error instanceof ContentIntentError?error.status:503});
  }

  return NextResponse.json({ list }, { status: 201 });
}

import { createClient, createServiceClient } from '@/lib/supabase/server';
import { NextResponse } from 'next/server';
import { z } from 'zod';

export const dynamic = 'force-dynamic';

const patchSchema = z.object({
  userId: z.string().uuid(),
  is_moderator: z.boolean().optional(),
  is_premium: z.boolean().optional(),
  is_suspended: z.boolean().optional(),
});

async function checkAdmin(supabase: ReturnType<typeof createClient>, userId: string) {
  const { data } = await supabase
    .from('users')
    .select('is_admin')
    .eq('id', userId)
    .single();
  return data?.is_admin === true;
}

export async function GET(req: Request) {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  if (!(await checkAdmin(supabase, user.id))) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const { searchParams } = new URL(req.url);
  const page = Math.max(1, parseInt(searchParams.get('page') ?? '1', 10));
  const search = searchParams.get('search') ?? '';
  const pageSize = 25;
  const from = (page - 1) * pageSize;

  const service = createServiceClient();

  let query = service
    .from('users')
    .select(
      'id, username, email, user_types, is_premium, is_moderator, is_admin, is_suspended, created_at',
      { count: 'exact' }
    )
    .order('created_at', { ascending: false })
    .range(from, from + pageSize - 1);

  if (search) {
    query = query.ilike('username', `%${search}%`);
  }

  const { data: users, count, error } = await query;

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({
    users: (users ?? []).map((u) => ({
      ...u,
      is_premium: (u).is_premium ?? false,
    })),
    total: count ?? 0,
    page,
    pageSize,
  });
}

export async function PATCH(req: Request) {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  if (!(await checkAdmin(supabase, user.id))) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const body = await req.json().catch(() => ({}));
  const parsed = patchSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const { userId, ...updates } = parsed.data;
  const service = createServiceClient();

  const { error } = await service.from('users').update(updates).eq('id', userId);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ updated: true });
}

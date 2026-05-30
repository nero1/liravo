import { NextRequest, NextResponse } from 'next/server';
import { createClient, createServiceClient } from '@/lib/supabase/server';
import { z } from 'zod';
import { getCurrentUser } from '@/lib/auth/getCurrentUser';

export const dynamic = 'force-dynamic';

const BodySchema = z.object({
  display_name: z.string().min(1).max(50),
  bio: z.string().max(280).nullable().optional(),
  country: z.string().max(2).nullable().optional(),
  avatar_url: z.string().nullable().optional(),
  external_links: z.array(z.string()).max(3).optional(),
});

export async function PUT(request: NextRequest) {
  const supabase = createClient();
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const parsed = BodySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: 'Invalid request body' }, { status: 400 });
  }

  const service = createServiceClient();
  const { error } = await service
    .from('users')
    .update(parsed.data)
    .eq('id', user.id);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}

import { NextResponse } from 'next/server';
import { z } from 'zod';
import { createServiceClient } from '@/lib/supabase/server';
import { requireModerator } from '@/lib/moderation';
import { getCurrentUser } from '@/lib/auth/getCurrentUser';

export const dynamic = 'force-dynamic';

const appealSchema = z.object({
  report_id: z.string().uuid().optional(),
  reason: z.string().min(10).max(500),
  content_type: z.enum(['review', 'quote', 'profile', 'debate']).optional(),
  content_id: z.string().uuid().optional(),
});

export async function POST(request: Request) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const raw = await request.json();
  const parsed = appealSchema.safeParse(raw);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? 'Invalid input' }, { status: 400 });
  }

  const serviceSupabase = createServiceClient();

  // appeals table may not be in DB type
  const { data, error } = await serviceSupabase
    .from('appeals')
    .insert({
      user_id: user.id,
      report_id: parsed.data.report_id ?? null,
      reason: parsed.data.reason,
      content_type: parsed.data.content_type ?? null,
      content_id: parsed.data.content_id ?? null,
      status: 'pending',
      created_at: new Date().toISOString(),
    })
    .select()
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ appeal: data }, { status: 201 });
}

export async function GET() {
  const auth = await requireModerator();
  if (auth instanceof NextResponse) return auth;

  const supabase = createServiceClient();

  // appeals table may not be in DB type
  const { data: appeals, error } = await supabase
    .from('appeals')
    .select('*')
    .eq('status', 'pending')
    .order('created_at', { ascending: true });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ appeals: appeals ?? [] });
}

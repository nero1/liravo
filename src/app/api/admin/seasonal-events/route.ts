import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { z } from 'zod';

export const dynamic = 'force-dynamic';

// seasonal_events table not in generated types — using any cast
// Expected columns: id, name, description, start_date, end_date, xp_multiplier, is_active, created_at

const CreateEventSchema = z.object({
  name: z.string().min(1).max(100),
  description: z.string().max(500).optional(),
  start_date: z.string().datetime(),
  end_date: z.string().datetime(),
  xp_multiplier: z.number().min(1).max(10).default(1.5),
});

async function requireAdmin(supabase: ReturnType<typeof createClient>) {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;

  const { data: profile } = await supabase
    .from('users')
    .select('is_admin')
    .eq('id', user.id)
    .single();

  if (!profile?.is_admin) return null;
  return user;
}

export async function GET() {
  const supabase = createClient();
  const user = await requireAdmin(supabase);

  if (!user) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const { data: events, error } = await supabase 
    .from('seasonal_events')
    .select('id, name, description, start_date, end_date, xp_multiplier, is_active, created_at')
    .order('start_date', { ascending: false });

  if (error) {
    return NextResponse.json({ events: [] });
  }

  return NextResponse.json({ events: events ?? [] });
}

export async function POST(request: NextRequest) {
  const supabase = createClient();
  const user = await requireAdmin(supabase);

  if (!user) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const parsed = CreateEventSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: 'Invalid body', details: parsed.error.flatten() }, { status: 400 });
  }

  const { data: event, error } = await supabase 
    .from('seasonal_events')
    .insert({
      name: parsed.data.name,
      description: parsed.data.description ?? null,
      start_date: parsed.data.start_date,
      end_date: parsed.data.end_date,
      xp_multiplier: parsed.data.xp_multiplier,
      is_active: true,
    })
    .select()
    .single();

  if (error) {
    return NextResponse.json({ error: 'Failed to create event' }, { status: 500 });
  }

  return NextResponse.json({ event }, { status: 201 });
}

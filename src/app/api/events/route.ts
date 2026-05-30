import { createClient } from '@/lib/supabase/server';
import { NextResponse } from 'next/server';
import { z } from 'zod';
import { getCurrentUser } from '@/lib/auth/getCurrentUser';

export const dynamic = 'force-dynamic';

const createSchema = z.object({
  title: z.string().min(1).max(200),
  description: z.string().min(1).max(5000),
  event_date: z.string().datetime(),
  is_paid: z.boolean().default(false),
  price: z.number().min(0).optional(),
  currency: z.string().default('USD'),
  book_id: z.string().uuid().optional(),
  max_attendees: z.number().int().min(1).optional(),
});

export async function GET(req: Request) {
  const supabase = createClient();
  const { searchParams } = new URL(req.url);
  const limit = Math.min(parseInt(searchParams.get('limit') ?? '20'), 50);
  const now = new Date().toISOString();

  const { data, error } = await supabase
    .from('events')
    .select('id, title, description, event_date, is_paid, price, currency, host_id, book_id, max_attendees, created_at')
    .gte('event_date', now)
    .order('event_date', { ascending: true })
    .limit(limit);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ events: data ?? [] });
}

export async function POST(req: Request) {
  const supabase = createClient();
  const user = await getCurrentUser();

  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  // Check if user is an author or admin
  const { data: profile } = await supabase
    .from('users')
    .select('is_admin, is_verified_author, user_types')
    .eq('id', user.id)
    .single();

  const canCreate =
    profile?.is_admin ||
    profile?.is_verified_author ||
    (profile?.user_types ?? []).includes('author') ||
    (profile?.user_types ?? []).includes('creator');

  if (!canCreate) {
    return NextResponse.json({ error: 'Only authors and creators can create events' }, { status: 403 });
  }

  const body = await req.json();
  const parsed = createSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const { data: event, error } = await supabase
    .from('events')
    .insert({
      title: parsed.data.title,
      description: parsed.data.description,
      event_date: parsed.data.event_date,
      is_paid: parsed.data.is_paid,
      price: parsed.data.price ?? null,
      currency: parsed.data.currency,
      book_id: parsed.data.book_id ?? null,
      max_attendees: parsed.data.max_attendees ?? null,
      host_id: user.id,
    })
    .select()
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ event }, { status: 201 });
}

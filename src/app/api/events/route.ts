import { contentIntent, ContentIntentError } from '@/lib/content-intents';
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
  price: z.number().min(0.5).max(5000).multipleOf(0.01).optional(),
  currency: z.enum(['USD','NGN','EUR']).default('USD'),
  book_id: z.string().uuid().optional(),
  max_attendees: z.number().int().min(1).optional(),
}).refine(value=>!value.is_paid||value.price!==undefined).refine(value=>Date.parse(value.event_date)>Date.now());

export async function GET(req: Request) {
  const supabase = createClient();
  const { searchParams } = new URL(req.url);
  const limit = Math.max(1,Math.min(parseInt(searchParams.get('limit') ?? '20')||20, 50));
  const now = new Date().toISOString();

  const { data, error } = await supabase
    .from('events')
    .select('id, title, description, event_date, is_paid, price:ticket_price, currency, host_id:organizer_id, book_id, max_attendees, created_at')
    .gte('event_date', now)
    .order('event_date', { ascending: true })
    .limit(limit);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ events: (data??[]).map(event=>({...event,price:event.price===null?null:Number(event.price)})) });
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

  const body = await req.json().catch(()=>null);
  const parsed = createSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  let event;
  try {
    const intent=await contentIntent(req,user.id,'events',{
      title: parsed.data.title,
      description: parsed.data.description,
      event_date: parsed.data.event_date,
      is_paid: parsed.data.is_paid,
      ticket_price: parsed.data.is_paid?parsed.data.price:null,
      currency: parsed.data.currency,
      book_id: parsed.data.book_id ?? null,
      max_attendees: parsed.data.max_attendees ?? null,
      organizer_id: user.id,
    });
    event = await intent.insert();
  } catch(error) {
    return NextResponse.json({error:error instanceof Error?error.message:'Content creation unavailable'},{status:error instanceof ContentIntentError?error.status:503});
  }

  return NextResponse.json({ event }, { status: 201 });
}

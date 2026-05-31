import { NextResponse } from 'next/server';
import bcrypt from 'bcryptjs';
import { z } from 'zod';
import { createServiceClient } from '@/lib/supabase/server';
import { createDoSession, SESSION_COOKIE, SESSION_TTL } from '@/lib/db/unified-client';
import { isDigitalOcean } from '@/lib/db/provider';
import { checkCriticalRateLimit } from '@/lib/rate-limit';
import { getClientIp } from '@/lib/utils';

export const dynamic = 'force-dynamic';

const BodySchema = z.object({
  email: z.string().email(),
  password: z.string().min(8),
});

export async function POST(request: Request) {
  if (!isDigitalOcean()) {
    return NextResponse.json({ error: 'This endpoint is only available in DO mode' }, { status: 404 });
  }

  const ip = getClientIp(request);
  const rate = await checkCriticalRateLimit(ip);
  if (!rate.allowed) {
    return NextResponse.json({ error: 'Too many requests' }, { status: 429 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const parsed = BodySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: 'Email and password (min 8 chars) are required' }, { status: 400 });
  }

  const { email, password } = parsed.data;
  const supabase = createServiceClient();

  // Check email not already taken
  const { data: existing } = await supabase
    .from('users')
    .select('id')
    .eq('email', email)
    .maybeSingle();

  if (existing) {
    return NextResponse.json({ error: 'Email already registered' }, { status: 409 });
  }

  const password_hash = await bcrypt.hash(password, 12);
  const id = crypto.randomUUID();

  const { error } = await supabase.from('users').insert({
    id,
    email,
    password_hash,
    created_at: new Date().toISOString(),
  });

  if (error) {
    return NextResponse.json({ error: 'Failed to create account' }, { status: 500 });
  }

  const token = await createDoSession({ id, email });

  // Fetch the newly created user row so mobile clients can bootstrap in one round-trip.
  const supabaseForProfile = createServiceClient();
  const { data: profile } = await supabaseForProfile
    .from('users')
    .select('*')
    .eq('id', id)
    .maybeSingle();

  const response = NextResponse.json({ ok: true, token, user: profile, userId: id });
  response.cookies.set(SESSION_COOKIE, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    maxAge: SESSION_TTL,
    path: '/',
  });

  return response;
}

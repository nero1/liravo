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
  password: z.string().min(1),
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
    return NextResponse.json({ error: 'Email and password are required' }, { status: 400 });
  }

  const { email, password } = parsed.data;
  const supabase = createServiceClient();

  const { data: user } = await supabase
    .from('users')
    .select('id, email, password_hash, deleted_at')
    .eq('email', email)
    .maybeSingle();

  // Timing-safe: always hash compare even on not-found to prevent enumeration
  if (!user || user.deleted_at) {
    await bcrypt.compare(password, '$2b$12$invalidhashfortimingnormalization000000000000000000');
    return NextResponse.json({ error: 'Invalid email or password' }, { status: 401 });
  }

  if (!user.password_hash) {
    // Existing Supabase user migrated to DO mode without a password set
    return NextResponse.json({ error: 'PASSWORD_RESET_REQUIRED' }, { status: 403 });
  }

  const valid = await bcrypt.compare(password, user.password_hash);
  if (!valid) {
    return NextResponse.json({ error: 'Invalid email or password' }, { status: 401 });
  }

  const token = await createDoSession({ id: user.id, email: user.email });

  // Fetch the full user row so mobile clients can bootstrap their state in one round-trip.
  const supabaseForProfile = createServiceClient();
  const { data: profile } = await supabaseForProfile
    .from('users')
    .select('*')
    .eq('id', user.id)
    .maybeSingle();

  // Return the token in the body so mobile (Bearer-token) clients can store it.
  const response = NextResponse.json({ ok: true, token, user: profile });
  response.cookies.set(SESSION_COOKIE, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    maxAge: SESSION_TTL,
    path: '/',
  });

  return response;
}

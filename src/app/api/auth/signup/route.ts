import { clientUser } from '@/lib/user-profile';
import { NextResponse } from 'next/server';
import bcrypt from 'bcryptjs';
import { z } from 'zod';
import { createServiceClient } from '@/lib/supabase/server';
import { createDoSession, SESSION_COOKIE, SESSION_TTL } from '@/lib/db/unified-client';
import { isDirectPostgres } from '@/lib/db/provider';
import { checkCriticalRateLimit } from '@/lib/rate-limit';
import { getClientIp } from '@/lib/utils';

export const dynamic = 'force-dynamic';

const BodySchema = z.object({
  email: z.string().email(),
  password: z.string().min(8),
  hcaptchaToken: z.string().optional(),
});

async function verifyHcaptcha(token: string): Promise<boolean> {
  const secret = process.env.HCAPTCHA_SECRET_KEY;
  if (!secret) return true; // Skip if not configured
  try {
    const res = await fetch('https://hcaptcha.com/siteverify', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ secret, response: token }),
    });
    const data = await res.json() as { success: boolean };
    return data.success === true;
  } catch {
    return false;
  }
}

export async function POST(request: Request) {
  if (!isDirectPostgres()) {
    return NextResponse.json({ error: 'This endpoint is only available in direct PostgreSQL mode' }, { status: 404 });
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

  const { email, password, hcaptchaToken } = parsed.data;

  // Verify hCaptcha if secret is configured
  if (process.env.HCAPTCHA_SECRET_KEY) {
    if (!hcaptchaToken) {
      return NextResponse.json({ error: 'Human verification required' }, { status: 400 });
    }
    const captchaOk = await verifyHcaptcha(hcaptchaToken);
    if (!captchaOk) {
      return NextResponse.json({ error: 'Human verification failed. Please try again.' }, { status: 400 });
    }
  }
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

  // Derive username from email prefix
  const emailPrefix = email.split('@')[0].replace(/[^a-z0-9_]/gi, '_').toLowerCase();
  const username = `${emailPrefix}_${id.slice(0, 6)}`;

  const {error}=await supabase.rpc('create_direct_account' as never,{p_id:id,p_email:email,p_username:username,p_display_name:emailPrefix,p_password_hash:password_hash} as never);

  if (error) {
    return NextResponse.json({error:error.code==='23505'?'Account already exists':'Failed to create account'},{status:error.code==='23505'?409:503});
  }

  const token = await createDoSession({ id, email });

  // Fetch the newly created user row so mobile clients can bootstrap in one round-trip.
  const supabaseForProfile = createServiceClient();
  const { data: profile } = await supabaseForProfile
    .from('users')
    .select('*')
    .eq('id', id)
    .maybeSingle();

  const response = NextResponse.json({ ok: true, token, user: clientUser(profile), userId: id });
  response.cookies.set(SESSION_COOKIE, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    maxAge: SESSION_TTL,
    path: '/',
  });

  return response;
}

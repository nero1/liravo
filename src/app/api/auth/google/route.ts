import { clientUser } from '@/lib/user-profile';
import { NextResponse } from 'next/server';
import { z } from 'zod';
import { createServiceClient } from '@/lib/supabase/server';
import { createDoSession, SESSION_COOKIE, SESSION_TTL } from '@/lib/db/unified-client';
import { isDirectPostgres } from '@/lib/db/provider';
import { checkCriticalRateLimit } from '@/lib/rate-limit';
import { getClientIp } from '@/lib/utils';

export const dynamic = 'force-dynamic';

const BodySchema = z.object({
  idToken: z.string().min(1),
});

interface GoogleTokenInfo {
  sub: string;
  email: string;
  email_verified: string;
  name?: string;
  picture?: string;
}

async function verifyGoogleIdToken(idToken: string): Promise<GoogleTokenInfo> {
  const res = await fetch(`https://oauth2.googleapis.com/tokeninfo?id_token=${idToken}`);
  if (!res.ok) throw new Error('Invalid Google ID token');
  const info = await res.json() as GoogleTokenInfo & { aud?: string; error?: string };
  if (info.error) throw new Error(`Google token error: ${info.error}`);

  const clientId = process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID;
  if (clientId && info.aud !== clientId) throw new Error('Token audience mismatch');
  if (info.email_verified !== 'true') throw new Error('Google email not verified');

  return info;
}

export async function POST(request: Request) {
  if (!isDirectPostgres()) {
    return NextResponse.json({ error: 'This endpoint is only available in direct PostgreSQL mode' }, { status: 404 });
  }

  const ip = getClientIp(request);
  const rate = await checkCriticalRateLimit(ip);
  if (!rate.allowed) return NextResponse.json({ error: 'Too many requests' }, { status: 429 });

  let body: unknown;
  try { body = await request.json(); } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const parsed = BodySchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: 'idToken is required' }, { status: 400 });

  let googleInfo: GoogleTokenInfo;
  try {
    googleInfo = await verifyGoogleIdToken(parsed.data.idToken);
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 401 });
  }

  const supabase = createServiceClient();

  // Find or create user
  let { data: user } = await supabase
    .from('users')
    .select('*')
    .eq('email', googleInfo.email)
    .maybeSingle();

  if (!user) {
    const id = crypto.randomUUID();
    const { data: newUser, error } = await supabase
      .from('users')
      .insert({
        id,
        email: googleInfo.email,
        display_name: googleInfo.name ?? googleInfo.email.split('@')[0],
        avatar_url: googleInfo.picture ?? null,
        google_id: googleInfo.sub,
        created_at: new Date().toISOString(),
      })
      .select('*')
      .single();

    if (error || !newUser) {
      return NextResponse.json({ error: 'Failed to create account' }, { status: 500 });
    }
    user = newUser;
  } else if (!user.google_id) {
    // Link Google to existing account
    await supabase.from('users').update({ google_id: googleInfo.sub }).eq('id', user.id);
  }

  const token = await createDoSession({ id: user.id, email: user.email });

  const response = NextResponse.json({ ok: true, token, user: clientUser(user) });
  response.cookies.set(SESSION_COOKIE, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    maxAge: SESSION_TTL,
    path: '/',
  });

  return response;
}

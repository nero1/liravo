/**
 * 2FA TOTP setup and enable flow.
 * GET  → generate a secret + QR code data URL (not yet saved)
 * POST → verify the provided TOTP code, then save the secret + recovery codes
 */
import { createClient, createServiceClient } from '@/lib/supabase/server';
import { NextResponse } from 'next/server';
import { generateSecret as otplibGenerateSecret, generateURI, verifySync } from 'otplib';
import QRCode from 'qrcode';
import { z } from 'zod';
import crypto from 'crypto';
import bcrypt from 'bcryptjs';
import { checkCriticalRateLimit } from '@/lib/rate-limit';
import { getClientIp } from '@/lib/utils';
import { getCurrentUser } from '@/lib/auth/getCurrentUser';

export const dynamic = 'force-dynamic';

const APP_NAME = 'Liravo';

function generateRecoveryCodes(count = 8): string[] {
  return Array.from({ length: count }, () =>
    crypto.randomBytes(5).toString('hex').toUpperCase().replace(/(.{5})/, '$1-')
  );
}

export async function GET() {
  const supabase = createClient();
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { data: profile } = await supabase
    .from('users')
    .select('username, totp_enabled')
    .eq('id', user.id)
    .single();

  if (profile?.totp_enabled) {
    return NextResponse.json({ error: '2FA is already enabled' }, { status: 409 });
  }

  const secret = otplibGenerateSecret();
  const otpauthUrl = generateURI({
    label: profile?.username ?? user.id,
    issuer: APP_NAME,
    secret,
  });

  const qrDataUrl = await QRCode.toDataURL(otpauthUrl);

  // Return secret and QR — not saved yet, user must verify first
  return NextResponse.json({ secret, qrDataUrl });
}

const verifySchema = z.object({
  secret: z.string().min(16).max(64),
  code: z.string().length(6).regex(/^\d{6}$/),
});

export async function POST(req: Request) {
  const ip = getClientIp(req);
  const rate = await checkCriticalRateLimit(ip);
  if (!rate.allowed) return NextResponse.json({ error: 'Too many requests' }, { status: 429 });

  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const raw = await req.text().catch(() => '');
  if (raw.length > 500) return NextResponse.json({ error: 'Payload too large' }, { status: 413 });
  let body: unknown;
  try { body = JSON.parse(raw); } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const parsed = verifySchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });

  const { secret, code } = parsed.data;

  const isValid = verifySync({ token: code, secret });
  if (!isValid) {
    return NextResponse.json({ error: 'Invalid verification code. Please try again.' }, { status: 422 });
  }

  // Generate recovery codes
  const recoveryCodes = generateRecoveryCodes(8);
  const hashedCodes = await Promise.all(
    recoveryCodes.map((c) => bcrypt.hash(c, 10))
  );

  // Save: encrypt secret + store hashed recovery codes
  const service = createServiceClient();
  const { error } = await service
    .from('users')
    .update({
      totp_secret: secret,
      totp_enabled: true,
      recovery_codes: hashedCodes,
    })
    .eq('id', user.id);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // Log security event
  await service.from('security_events').insert({
    user_id: user.id,
    event_type: '2fa_enabled',
  });

  return NextResponse.json({ ok: true, recoveryCodes });
}

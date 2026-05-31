import { createServiceClient } from '@/lib/supabase/server';
import { NextResponse } from 'next/server';
import { z } from 'zod';
import { sendEmail, buildVerificationEmail } from '@/lib/email';
import { checkCriticalRateLimit } from '@/lib/rate-limit';
import { getClientIp } from '@/lib/utils';
import crypto from 'crypto';
import { getCurrentUser } from '@/lib/auth/getCurrentUser';

export const dynamic = 'force-dynamic';

const APP_URL = process.env.NEXT_PUBLIC_APP_URL ?? 'https://liravo.org';

const schema = z.object({
  email: z.string().email().max(254).toLowerCase(),
});

export async function POST(req: Request) {
  const ip = getClientIp(req);
  const rate = await checkCriticalRateLimit(ip);
  if (!rate.allowed) {
    return NextResponse.json({ error: 'Too many requests' }, { status: 429 });
  }

  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const raw = await req.text().catch(() => '');
  if (raw.length > 1000) return NextResponse.json({ error: 'Payload too large' }, { status: 413 });
  let body: unknown;
  try { body = raw ? JSON.parse(raw) : {}; } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const parsed = schema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });

  const { email } = parsed.data;

  const service = createServiceClient();

  // Check email is not already used by another user
  const { data: existing } = await service
    .from('users')
    .select('id')
    .eq('email', email)
    .neq('id', user.id)
    .single();

  if (existing) {
    return NextResponse.json({ error: 'This email is already associated with another account' }, { status: 409 });
  }

  // Get user profile for display name
  const { data: profile } = await service
    .from('users')
    .select('display_name, username')
    .eq('id', user.id)
    .single();

  // Generate a secure verification token
  const token = crypto.randomBytes(32).toString('hex');
  const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();

  // Store token in DB
  await service.from('email_verification_tokens').upsert({
    user_id: user.id,
    email,
    token,
    expires_at: expiresAt,
  }, { onConflict: 'user_id' });

  // Update user record with the pending email
  await service.from('users').update({
    email,
    email_verified: false,
  }).eq('id', user.id);

  const verificationUrl = `${APP_URL}/api/users/verify-email?token=${token}`;
  const displayName = profile?.display_name ?? profile?.username ?? 'there';

  const { subject, html, text } = buildVerificationEmail(displayName, verificationUrl);

  const result = await sendEmail({
    to: email,
    type: 'email_verification',
    isPaidUser: false, // transactional — always allowed
    subject,
    html,
    text,
  });

  if (!result.ok) {
    console.error('[send-verification] Mailgun error:', result.error);
    return NextResponse.json({ error: 'Failed to send verification email. Please try again.' }, { status: 500 });
  }

  return NextResponse.json({ ok: true, message: 'Verification email sent. Check your inbox.' });
}

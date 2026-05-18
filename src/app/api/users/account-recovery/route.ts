import { createServiceClient } from '@/lib/supabase/server';
import { NextResponse } from 'next/server';
import { z } from 'zod';
import { sendEmail, buildRecoveryEmail } from '@/lib/email';
import { checkCriticalRateLimit } from '@/lib/rate-limit';
import { getClientIp } from '@/lib/utils';
import crypto from 'crypto';

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

  const raw = await req.text().catch(() => '');
  if (raw.length > 500) return NextResponse.json({ error: 'Payload too large' }, { status: 413 });
  let body: unknown;
  try { body = raw ? JSON.parse(raw) : {}; } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const parsed = schema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });

  const { email } = parsed.data;

  const service = createServiceClient();

  // Look up user by verified email — always respond with same message to prevent enumeration
  const { data: user } = await service
    .from('users')
    .select('id, display_name, username')
    .eq('email', email)
    .eq('email_verified', true)
    .single();

  if (user) {
    const token = crypto.randomBytes(32).toString('hex');
    const expiresAt = new Date(Date.now() + 60 * 60 * 1000).toISOString(); // 1 hour

    await service.from('email_verification_tokens').upsert({
      user_id: user.id,
      email,
      token,
      expires_at: expiresAt,
    }, { onConflict: 'user_id' });

    const recoveryUrl = `${APP_URL}/api/users/verify-recovery?token=${token}`;
    const displayName = user.display_name ?? user.username ?? 'there';

    const { subject, html, text } = buildRecoveryEmail(displayName, recoveryUrl);

    await sendEmail({
      to: email,
      type: 'account_recovery',
      isPaidUser: false, // transactional — always allowed
      subject,
      html,
      text,
    });
  }

  // Always return success to prevent email enumeration
  return NextResponse.json({
    ok: true,
    message: 'If an account with that email exists, a recovery link has been sent.',
  });
}

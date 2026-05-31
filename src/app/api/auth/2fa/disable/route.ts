import { createServiceClient } from '@/lib/supabase/server';
import { NextResponse } from 'next/server';
import { verifySync } from 'otplib';
import { z } from 'zod';
import bcrypt from 'bcryptjs';
import { checkCriticalRateLimit } from '@/lib/rate-limit';
import { getClientIp } from '@/lib/utils';
import { getCurrentUser } from '@/lib/auth/getCurrentUser';

export const dynamic = 'force-dynamic';

const schema = z.object({
  code: z.string().length(6).regex(/^\d{6}$/).optional(),
  recoveryCode: z.string().min(8).max(20).optional(),
}).refine((d) => d.code ?? d.recoveryCode, {
  message: 'Provide either a TOTP code or a recovery code',
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

  const parsed = schema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });

  const { code, recoveryCode } = parsed.data;

  const service = createServiceClient();
  const { data: profile } = await service
    .from('users')
    .select('totp_enabled, totp_secret, recovery_codes')
    .eq('id', user.id)
    .single();

  if (!profile?.totp_enabled) {
    return NextResponse.json({ error: '2FA is not enabled' }, { status: 400 });
  }

  let verified = false;

  if (code && profile.totp_secret) {
    verified = !!(verifySync({ token: code, secret: profile.totp_secret }) as unknown);
  } else if (recoveryCode && profile.recovery_codes) {
    // Check each hashed recovery code
    for (let i = 0; i < profile.recovery_codes.length; i++) {
      if (await bcrypt.compare(recoveryCode.toUpperCase(), profile.recovery_codes[i])) {
        // Consume the code (remove it)
        const updatedCodes = [...profile.recovery_codes];
        updatedCodes.splice(i, 1);
        await service.from('users').update({ recovery_codes: updatedCodes }).eq('id', user.id);
        verified = true;
        break;
      }
    }
  }

  if (!verified) {
    return NextResponse.json({ error: 'Invalid code' }, { status: 422 });
  }

  // Disable 2FA
  const { error } = await service
    .from('users')
    .update({ totp_enabled: false, totp_secret: null, recovery_codes: null })
    .eq('id', user.id);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  await service.from('security_events').insert({
    user_id: user.id,
    event_type: '2fa_disabled',
  });

  return NextResponse.json({ ok: true });
}

import { directLoginResponse } from '@/lib/auth/second-factor';
import { clientUser } from '@/lib/user-profile';
import { NextResponse } from 'next/server';
import bcrypt from 'bcryptjs';
import { z } from 'zod';
import { createServiceClient } from '@/lib/supabase/server';
import { isDirectPostgres } from '@/lib/db/provider';
import { checkCriticalRateLimit } from '@/lib/rate-limit';
import { getClientIp } from '@/lib/utils';
import { getRedisClient } from '@/lib/redis';

export const dynamic = 'force-dynamic';

const FAILED_ATTEMPTS_TTL = 15 * 60; // 15 minutes
const CAPTCHA_THRESHOLD = 3;

const BodySchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
  hcaptchaToken: z.string().optional(),
});

async function verifyHcaptcha(token: string): Promise<boolean> {
  const secret = process.env.HCAPTCHA_SECRET_KEY;
  if (!secret) return true;
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
    return NextResponse.json({ error: 'Email and password are required' }, { status: 400 });
  }

  const { email, password, hcaptchaToken } = parsed.data;

  // Check failed attempts count; require captcha if >= CAPTCHA_THRESHOLD
  const redis = getRedisClient();
  const failKey = `auth:fail:${ip}`;
  const failCountStr = await redis.get(failKey);
  const failCount = failCountStr ? parseInt(failCountStr, 10) : 0;

  if (process.env.HCAPTCHA_SECRET_KEY && failCount >= CAPTCHA_THRESHOLD) {
    if (!hcaptchaToken) {
      return NextResponse.json({ error: 'Human verification required', requireCaptcha: true }, { status: 400 });
    }
    const captchaOk = await verifyHcaptcha(hcaptchaToken);
    if (!captchaOk) {
      return NextResponse.json({ error: 'Human verification failed. Please try again.', requireCaptcha: true }, { status: 400 });
    }
  }

  const supabase = createServiceClient();

  const { data: user, error:lookupError } = await supabase
    .from('users')
    .select('id, email, password_hash, deleted_at')
    .eq('email', email)
    .maybeSingle();

  if(lookupError)return NextResponse.json({error:'Authentication unavailable'},{status:503});

  // Timing-safe: always hash compare even on not-found to prevent enumeration
  if (!user || user.deleted_at) {
    await bcrypt.compare(password, '$2b$12$9e0BKWDqcma0ywIEdZgZG.SwcEW940wVFsjKKETPzSDZcfk3yxqXa');
    await redis.incr(failKey);
    await redis.expire(failKey, FAILED_ATTEMPTS_TTL);
    const newFail = failCount + 1;
    return NextResponse.json({
      error: 'Invalid email or password',
      requireCaptcha: process.env.HCAPTCHA_SECRET_KEY ? newFail >= CAPTCHA_THRESHOLD : false,
    }, { status: 401 });
  }

  if (!user.password_hash) {
    return NextResponse.json({ error: 'PASSWORD_RESET_REQUIRED' }, { status: 403 });
  }

  const valid = await bcrypt.compare(password, user.password_hash);
  if (!valid) {
    await redis.incr(failKey);
    await redis.expire(failKey, FAILED_ATTEMPTS_TTL);
    const newFail = failCount + 1;
    return NextResponse.json({
      error: 'Invalid email or password',
      requireCaptcha: process.env.HCAPTCHA_SECRET_KEY ? newFail >= CAPTCHA_THRESHOLD : false,
    }, { status: 401 });
  }

  // Successful login — clear fail counter
  await redis.del(failKey);

  const {data:profile}=await createServiceClient().from('users').select('*').eq('id',user.id).maybeSingle();
  return directLoginResponse(user,clientUser(profile));
}

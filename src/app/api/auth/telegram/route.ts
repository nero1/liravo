import { directLoginResponse } from '@/lib/auth/second-factor';
import { clientUser } from '@/lib/user-profile';
import { NextResponse } from 'next/server';
import { createClient, createServiceClient } from '@/lib/supabase/server';
import { z } from 'zod';
import { isDirectPostgres } from '@/lib/db/provider';
import { checkCriticalRateLimit } from '@/lib/rate-limit';
import { getClientIp } from '@/lib/utils';
import { createHash,createHmac,timingSafeEqual } from 'crypto';

export const dynamic = 'force-dynamic';

// Telegram Login Widget sends these fields
const TelegramAuthSchema = z.object({
  id: z.number().int().positive().max(Number.MAX_SAFE_INTEGER),
  first_name: z.string().max(256).optional(),
  last_name: z.string().max(256).optional(),
  username: z.string().max(256).optional(),
  photo_url: z.string().url().max(2048).optional(),
  auth_date: z.number().int().positive(),
  hash: z.string().regex(/^[a-f0-9]{64}$/),
}).catchall(z.union([z.string().max(4096),z.number().finite(),z.boolean()]));

function verifyTelegramHash(data: Record<string, string | number | boolean>, hash: string): boolean {
  const botToken = process.env.TELEGRAM_BOT_TOKEN;
  if (!botToken) throw new Error('TELEGRAM_BOT_TOKEN not configured');

  // Build data-check-string: sorted key=value lines (excluding hash)
  const checkString = Object.entries(data)
    .filter(([k]) => k !== 'hash')
    .sort(([a],[b])=>a<b?-1:a>b?1:0)
    .map(([k, v]) => `${k}=${v}`)
    .join('\n');

  const secretKey = createHash('sha256').update(botToken).digest();
  const expectedHash = createHmac('sha256', secretKey).update(checkString).digest();
  return timingSafeEqual(expectedHash,Buffer.from(hash,'hex'));
}

export async function POST(request: Request) {
  if (!isDirectPostgres()) {
    // In Supabase mode, use Supabase's own Telegram OAuth flow
    return NextResponse.json({ error: 'Use Supabase OAuth in this deployment mode' }, { status: 404 });
  }

  const ip = getClientIp(request);
  const rate = await checkCriticalRateLimit(ip);
  if (!rate.allowed) return NextResponse.json({ error: 'Too many requests' }, { status: 429 });

  let body: unknown;
  try { body = await request.json(); } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const parsed = TelegramAuthSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: 'Invalid Telegram auth data' }, { status: 400 });
  }

  const { hash, ...telegramData } = parsed.data;

  // Verify the hash
  try {
    const valid = verifyTelegramHash(telegramData as Record<string, string | number | boolean>, hash);
    if (!valid) return NextResponse.json({ error: 'Invalid Telegram signature' }, { status: 401 });
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 500 });
  }

  // Check auth_date is not too old (10 min window)
  const age = Math.floor(Date.now() / 1000) - telegramData.auth_date;
  if (age > 600 || age < -60) return NextResponse.json({ error: 'Auth data expired' }, { status: 401 });

  const supabase = createServiceClient();
  const telegramId = String(telegramData.id);

  const displayName=[telegramData.first_name,telegramData.last_name].filter(Boolean).join(' ')||telegramData.username||'tg_'+telegramId;
  const {data:user,error}=await supabase.rpc('resolve_direct_social_identity' as never,{p_provider:'telegram',p_subject:telegramId,p_email:null,p_display_name:displayName,p_avatar_url:telegramData.photo_url??null} as never);
  if(error||!user)return NextResponse.json({error:'Authentication unavailable'},{status:error?.code==='P1003'?403:error?.code==='P1001'?409:503});
  return directLoginResponse(user as unknown as {id:string;email:string|null},clientUser(user),request);
}

// Supabase mode: redirect to Supabase Telegram OAuth
export async function GET() {
  if (isDirectPostgres()) {
    return NextResponse.json({ error: 'Use POST with Telegram auth data' }, { status: 405 });
  }

  const supabase = createClient();
  const { data, error } = await supabase.auth.signInWithOAuth({
    provider: 'telegram' as never,
    options: {
      redirectTo: `${process.env.NEXT_PUBLIC_APP_URL}/auth/callback`,
    },
  });

  if (error || !data.url) {
    return NextResponse.json({ error: 'OAuth init failed' }, { status: 500 });
  }

  return NextResponse.redirect(data.url);
}

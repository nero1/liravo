import { directLoginResponse } from '@/lib/auth/second-factor';
import { clientUser } from '@/lib/user-profile';
import { NextResponse } from 'next/server';
import { createClient, createServiceClient } from '@/lib/supabase/server';
import { z } from 'zod';
import { isDirectPostgres } from '@/lib/db/provider';
import { checkCriticalRateLimit } from '@/lib/rate-limit';
import { getClientIp } from '@/lib/utils';
import { createHmac } from 'crypto';

export const dynamic = 'force-dynamic';

// Telegram Login Widget sends these fields
const TelegramAuthSchema = z.object({
  id: z.number(),
  first_name: z.string().optional(),
  last_name: z.string().optional(),
  username: z.string().optional(),
  photo_url: z.string().url().optional(),
  auth_date: z.number(),
  hash: z.string().min(64).max(64),
});

function verifyTelegramHash(data: Record<string, string | number>, hash: string): boolean {
  const botToken = process.env.TELEGRAM_BOT_TOKEN;
  if (!botToken) throw new Error('TELEGRAM_BOT_TOKEN not configured');

  // Build data-check-string: sorted key=value lines (excluding hash)
  const checkString = Object.entries(data)
    .filter(([k]) => k !== 'hash')
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([k, v]) => `${k}=${v}`)
    .join('\n');

  const secretKey = createHmac('sha256', 'WebAppData').update(botToken).digest();
  const expectedHash = createHmac('sha256', secretKey).update(checkString).digest('hex');
  return expectedHash === hash;
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
    const valid = verifyTelegramHash(telegramData as Record<string, string | number>, hash);
    if (!valid) return NextResponse.json({ error: 'Invalid Telegram signature' }, { status: 401 });
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 500 });
  }

  // Check auth_date is not too old (10 min window)
  const age = Math.floor(Date.now() / 1000) - telegramData.auth_date;
  if (age > 600 || age < -60) return NextResponse.json({ error: 'Auth data expired' }, { status: 401 });

  const supabase = createServiceClient();
  const telegramId = String(telegramData.id);

  // Find existing user by telegram_id
  let { data: user } = await supabase
    .from('users')
    .select('*')
    .eq('telegram_id', telegramId)
    .maybeSingle();

  if (!user) {
    // Create new user
    const displayName = [telegramData.first_name, telegramData.last_name].filter(Boolean).join(' ')
      || telegramData.username
      || `tg_${telegramId}`;

    const baseUsername = (telegramData.username ?? `tg${telegramId}`).toLowerCase().replace(/[^a-z0-9_]/g, '');
    const username = `${baseUsername}_${Math.floor(Math.random() * 9999)}`;

    const {data:newUser,error}=await supabase.rpc('create_direct_account' as never,{p_id:crypto.randomUUID(),p_email:null,p_username:username,p_display_name:displayName,p_telegram_id:telegramId,p_avatar_url:telegramData.photo_url??null} as never);

    if (error || !newUser) {
      return NextResponse.json({ error: 'Failed to create account' }, { status: 500 });
    }
    user=newUser as unknown as typeof user;
  }

  if(!user)return NextResponse.json({error:'Account unavailable'},{status:503});
  return directLoginResponse(user,clientUser(user),request);
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

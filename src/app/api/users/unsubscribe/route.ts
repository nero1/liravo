import { createServiceClient } from '@/lib/supabase/server';
import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const token = searchParams.get('token');
  const APP_URL = process.env.NEXT_PUBLIC_APP_URL ?? 'https://liravo.org';

  if (!token) {
    return NextResponse.redirect(`${APP_URL}/settings/notifications?error=invalid_token`);
  }

  const service = createServiceClient();

  // Unsubscribe token is a SHA-256 of user_id + secret — look up in users
  const { data: user } = await service
    .from('users')
    .select('id')
    .eq('unsubscribe_token', token)
    .single();

  if (!user) {
    return NextResponse.redirect(`${APP_URL}/settings/notifications?error=invalid_token`);
  }

  await service.from('users').update({
    email_digest_enabled: false,
  }).eq('id', user.id);

  return NextResponse.redirect(`${APP_URL}/settings/notifications?unsubscribed=1`);
}

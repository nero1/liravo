import { createServiceClient } from '@/lib/supabase/server';
import { NextResponse } from 'next/server';

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const token = searchParams.get('token');
  const APP_URL = process.env.NEXT_PUBLIC_APP_URL ?? 'https://liravo.org';

  if (!token || token.length !== 64) {
    return NextResponse.redirect(`${APP_URL}/settings/email?error=invalid_token`);
  }

  const service = createServiceClient();

  const { data: record } = await service
    .from('email_verification_tokens')
    .select('user_id, email, expires_at')
    .eq('token', token)
    .single();

  if (!record) {
    return NextResponse.redirect(`${APP_URL}/settings/email?error=invalid_token`);
  }

  if (new Date(record.expires_at) < new Date()) {
    return NextResponse.redirect(`${APP_URL}/settings/email?error=expired_token`);
  }

  // Mark email as verified on the user record
  await service.from('users').update({
    email: record.email,
    email_verified: true,
  }).eq('id', record.user_id);

  // Delete the used token
  await service.from('email_verification_tokens').delete().eq('token', token);

  return NextResponse.redirect(`${APP_URL}/settings/email?verified=1`);
}

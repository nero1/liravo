import { createClient } from '@/lib/supabase/server';
import { redirect } from 'next/navigation';
import type { Metadata } from 'next';
import TwoFAClient from './TwoFAClient';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = { title: '2FA Security — Liravo' };

export default async function TwoFAPage() {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  const { data: profile } = await supabase
    .from('users')
    .select('totp_enabled')
    .eq('id', user.id)
    .single();

  return (
    <div className="max-w-lg mx-auto px-4 py-6">
      <h1 className="font-display text-2xl font-bold mb-2">Two-Factor Authentication</h1>
      <p className="text-sm text-muted-foreground mb-6">
        Use an authenticator app (Google Authenticator, Authy, etc.) to add a second layer of
        security. No SMS — authenticator app only.
      </p>
      <TwoFAClient enabled={profile?.totp_enabled ?? false} />
    </div>
  );
}

import { createClient, createServiceClient } from '@/lib/supabase/server';
import { redirect } from 'next/navigation';
import type { Metadata } from 'next';
import EmailSettingsForm from './EmailSettingsForm';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = { title: 'Email Recovery' };

export default async function EmailSettingsPage() {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  const { data: profile } = await createServiceClient()
    .from('users')
    .select('email, email_verified')
    .eq('id', user.id)
    .single();

  return (
    <div className="max-w-lg mx-auto px-4 py-6">
      <h1 className="font-display text-2xl font-bold mb-2">Email Recovery</h1>
      <p className="text-sm text-muted-foreground mb-6">
        Add an email address for account recovery. This is optional but recommended.
        Email notifications are available on paid plans only.
      </p>
      <EmailSettingsForm
        currentEmail={profile?.email ?? null}
        isVerified={profile?.email_verified ?? false}
      />
    </div>
  );
}

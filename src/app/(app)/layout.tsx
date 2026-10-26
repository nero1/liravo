import { redirect } from 'next/navigation';
import { getCurrentUser } from '@/lib/auth/getCurrentUser';
import { isDirectPostgres } from '@/lib/db/provider';
import { SideNav } from '@/components/layout/SideNav';
import { BottomNav } from '@/components/layout/BottomNav';
import { createClient, createServiceClient } from '@/lib/supabase/server';
import { isModerator } from '@/lib/moderation';
import { AccountHardeningBanner } from '@/components/profile/AccountHardeningBanner';

export const dynamic = 'force-dynamic';

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  if (isDirectPostgres() && !await getCurrentUser()) redirect('/login');
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();

  const moderator = user ? await isModerator(user.id) : false;

  let isAuthor = false;
  let hasEmail = false;
  let emailVerified = false;
  let showBanner = false;

  if (user) {
    const { data: profile } = await createServiceClient()
      .from('users')
      .select('email, email_verified, created_at, is_verified_author, user_types')
      .eq('id', user.id)
      .single();

    hasEmail = !!profile?.email;
    emailVerified = profile?.email_verified ?? false;
    isAuthor =
      profile?.is_verified_author ||
      (profile?.user_types ?? []).includes('author') ||
      false;

    // Show banner if account is older than 7 days and email not set or not verified
    const accountAge = profile?.created_at
      ? Date.now() - new Date(profile.created_at).getTime()
      : 0;
    const sevenDaysMs = 7 * 24 * 60 * 60 * 1000;
    showBanner = accountAge > sevenDaysMs && (!hasEmail || !emailVerified);
  }

  return (
    <div className="flex min-h-screen">
      <SideNav isModerator={moderator} isAuthor={isAuthor} />
      <main className="flex-1 pb-20 md:pb-0 min-w-0">
        {showBanner && (
          <div className="px-4 pt-4 max-w-2xl mx-auto">
            <AccountHardeningBanner hasEmail={hasEmail} emailVerified={emailVerified} />
          </div>
        )}
        {children}
      </main>
      <BottomNav />
    </div>
  );
}

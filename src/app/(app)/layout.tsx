import { SideNav } from '@/components/layout/SideNav';
import { BottomNav } from '@/components/layout/BottomNav';
import { createClient } from '@/lib/supabase/server';
import { isModerator } from '@/lib/moderation';
import { AccountHardeningBanner } from '@/components/profile/AccountHardeningBanner';

export const dynamic = 'force-dynamic';

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();

  const moderator = user ? await isModerator(user.id) : false;

  let hasEmail = false;
  let emailVerified = false;
  let showBanner = false;

  if (user) {
    const { data: profile } = await supabase
      .from('users')
      .select('email, email_verified, created_at')
      .eq('id', user.id)
      .single();

    hasEmail = !!profile?.email;
    emailVerified = profile?.email_verified ?? false;

    // Show banner if account is older than 7 days and email not set or not verified
    const accountAge = profile?.created_at
      ? Date.now() - new Date(profile.created_at).getTime()
      : 0;
    const sevenDaysMs = 7 * 24 * 60 * 60 * 1000;
    showBanner = accountAge > sevenDaysMs && (!hasEmail || !emailVerified);
  }

  return (
    <div className="flex min-h-screen">
      <SideNav isModerator={moderator} />
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

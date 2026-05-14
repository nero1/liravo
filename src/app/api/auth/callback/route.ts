import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createServiceClient } from '@/lib/supabase/server';
import { awardXP } from '@/services/xp';
import { XP_CONFIG } from '@/constants/config';
import { checkAndAwardBadges } from '@/services/badges';

export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get('code');
  const next = searchParams.get('next') ?? '/';
  const refCode = searchParams.get('ref');

  if (code) {
    const supabase = createClient();
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error) {
      const { data: { user } } = await supabase.auth.getUser();
      if (user) {
        const { data: profile } = await supabase
          .from('users')
          .select('onboarding_complete, referred_by')
          .eq('id', user.id)
          .single();

        // Handle referral attribution if ref code provided and not yet attributed
        if (refCode && profile && !profile.referred_by) {
          const serviceClient = createServiceClient();

          // Find the referrer by their referral code
          const { data: referrer } = await serviceClient
            .from('users')
            .select('id')
            .eq('referral_code', refCode)
            .neq('id', user.id)
            .single();

          if (referrer) {
            // Mark the new user as referred
            await serviceClient
              .from('users')
              .update({ referred_by: referrer.id })
              .eq('id', user.id);

            // Award XP to the referrer
            await awardXP(referrer.id, XP_CONFIG.REFER_SIGNUP, 'referral_signup');

            // Create notification for referrer
            await serviceClient.from('notifications').insert({
              user_id: referrer.id,
              type: 'referral',
              actor_id: user.id,
              message: `Someone signed up using your referral link! +${XP_CONFIG.REFER_SIGNUP} XP`,
            });

            // Check referral badges for the referrer
            await checkAndAwardBadges(referrer.id, 'referral');

            // Record in referrals table if it exists
            try {
              await serviceClient
                .from('referrals')
                .insert({
                  referrer_id: referrer.id,
                  referred_id: user.id,
                });
            } catch {
              // Silently ignore if table doesn't exist
            }
          }
        }

        if (!profile?.onboarding_complete) {
          return NextResponse.redirect(`${origin}/onboarding`);
        }
      }
      return NextResponse.redirect(`${origin}${next}`);
    }
  }

  return NextResponse.redirect(`${origin}/login?error=auth_callback_failed`);
}

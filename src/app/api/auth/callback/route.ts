import {accountLocale} from '@/lib/auth/locale';
import { safeReturnPath, getRequestCorrelationId } from '@/lib/utils';
import { recordMetric } from '@/lib/metrics';
import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createServiceClient } from '@/lib/supabase/server';
import { checkAndAwardBadges } from '@/services/badges';
import { isDirectPostgres } from '@/lib/db/provider';
import { factorProfile } from '@/lib/auth/second-factor';
import { getCurrentUser } from '@/lib/auth/getCurrentUser';

export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url);

  // Direct-postgres mode: OAuth is not supported — redirect with error
  if (isDirectPostgres()) {
    return NextResponse.redirect(`${origin}/login?error=oauth_not_supported`);
  }

  const code = searchParams.get('code');
  const next = safeReturnPath(searchParams.get('next'));
  const refCode = searchParams.get('ref');

  if (code) {
    const supabase = createClient();
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error) {
      const {data:{user:primaryUser}}=await createClient({skipMfa:true}).auth.getUser();
      if(primaryUser){const {error:localeError}=await createServiceClient().rpc('initialize_account_locale' as never,{p_user_id:primaryUser.id,p_locale:accountLocale(request)} as never);if(localeError)return NextResponse.redirect(`${origin}/login?error=auth_callback_failed`);}
      if(primaryUser&&(await factorProfile(primaryUser.id))?.totp_enabled)return NextResponse.redirect(`${origin}/login?mfa=required&next=${encodeURIComponent(next)}`);
      const user = await getCurrentUser();
      if (user) {
        const { data: profile } = await supabase
          .from('users')
          .select('onboarding_complete, referred_by')
          .eq('id', user.id)
          .single();

        if (refCode) {
          const { data: referrerId, error: referralError } = await createServiceClient().rpc('attribute_referral_atomic' as never, {
            p_user_id: user.id, p_code: refCode,
          } as never);
          if (referralError) recordMetric('referral_attribution_error', { userId: user.id, correlationId: getRequestCorrelationId(request), code: referralError.code }, 'error');
          else if (referrerId) await checkAndAwardBadges(String(referrerId), 'referral');
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

import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { XP_CONFIG } from '@/constants/config';

export const dynamic = 'force-dynamic';

export async function GET() {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  // Count referred users
  const { count: referralCount } = await supabase
    .from('users')
    .select('*', { count: 'exact', head: true })
    .eq('referred_by', user.id);

  const count = referralCount ?? 0;

  // Total XP earned from referrals (base + milestones)
  let xpFromReferrals = count * XP_CONFIG.REFER_SIGNUP;
  if (count >= 10) xpFromReferrals += XP_CONFIG.REFER_MILESTONE_10;
  if (count >= 50) xpFromReferrals += XP_CONFIG.REFER_MILESTONE_50;

  // Get the user's referral code
  const { data: profile } = await supabase
    .from('users')
    .select('referral_code')
    .eq('id', user.id)
    .single();

  return NextResponse.json({
    referralCount: count,
    xpFromReferrals,
    referralCode: profile?.referral_code ?? null,
  });
}

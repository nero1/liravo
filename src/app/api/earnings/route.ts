import { createClient } from '@/lib/supabase/server';
import { NextResponse } from 'next/server';
import Decimal from 'decimal.js';
import { getCurrentUser } from '@/lib/auth/getCurrentUser';

export const dynamic = 'force-dynamic';

export async function GET() {
  const supabase = createClient();
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  // Tips received (as creator)
  const { data: tips } = await supabase
    .from('tips')
    .select('recipient_amount, creator_amount')
    .or(`recipient_id.eq.${user.id},creator_id.eq.${user.id}`)
    .eq('currency', 'USD')
    .eq('status', 'completed');

  const tipsTotal = (tips ?? []).reduce(
    (acc: Decimal, t: { recipient_amount: string; creator_amount: string }) => acc.plus(new Decimal(t.recipient_amount ?? t.creator_amount ?? 0)),
    new Decimal(0)
  );

  // Referral commissions (10% of platform gross from referred users' subscriptions)
  const { data: commissions } = await supabase
    .from('referral_commissions')
    .select('commission_amount')
    .is('reversed_at', null)
    .eq('referrer_id', user.id);

  const commissionsTotal = (commissions ?? []).reduce(
    (acc: Decimal, c: { commission_amount: string }) => acc.plus(new Decimal(c.commission_amount ?? 0)),
    new Decimal(0)
  );

  // Event revenue (ticket sales, workshop fees)
  const { data: eventRevenue } = await supabase
    .from('event_revenue')
    .select('amount')
    .eq('organizer_id', user.id)
    .eq('currency', 'USD');

  const eventTotal = (eventRevenue ?? []).reduce(
    (acc: Decimal, e: { amount: string }) => acc.plus(new Decimal(e.amount ?? 0)),
    new Decimal(0)
  );

  const totalEarnings = tipsTotal.plus(commissionsTotal).plus(eventTotal);

  // Payout history
  const { data: payouts } = await supabase
    .from('payout_requests')
    .select('id, amount, status, created_at')
    .eq('user_id', user.id)
    .order('created_at', { ascending: false });

  return NextResponse.json({
    tipsReceived: tipsTotal.toFixed(2),
    referralCommissions: commissionsTotal.toFixed(2),
    eventRevenue: eventTotal.toFixed(2),
    totalEarnings: totalEarnings.toFixed(2),
    payouts: (payouts ?? []).map((p: { id: string; amount: string; status: string; created_at: string }) => ({
      id: p.id,
      amount: new Decimal(p.amount ?? 0).toFixed(2),
      status: p.status,
      created_at: p.created_at,
    })),
  });
}

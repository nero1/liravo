import { createClient } from '@/lib/supabase/server';
import { redirect } from 'next/navigation';
import type { Metadata } from 'next';

export const metadata: Metadata = { title: 'Earnings — Liravo' };

interface EarningsSummary {
  tipsReceived: string;
  referralCommissions: string;
  eventRevenue: string;
  totalEarnings: string;
  payouts: { id: string; amount: string; status: string; created_at: string }[];
}

async function getEarnings(): Promise<EarningsSummary | null> {
  try {
    const baseUrl = process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3000';
    const res = await fetch(`${baseUrl}/api/earnings`, {
      headers: { Cookie: '' },
      cache: 'no-store',
    });
    if (!res.ok) return null;
    return res.json();
  } catch {
    return null;
  }
}

export default async function EarningsPage() {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  const earnings = await getEarnings();

  return (
    <div className="max-w-2xl mx-auto px-4 py-6">
      <h1 className="font-display text-2xl font-bold mb-6">Earnings Dashboard</h1>

      {!earnings ? (
        <p className="text-muted-foreground">Could not load earnings. Please try again later.</p>
      ) : (
        <div className="space-y-6">
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
            <div className="rounded-xl border border-border bg-card p-4">
              <p className="text-xs text-muted-foreground mb-1">Tips Received</p>
              <p className="font-bold text-lg">${earnings.tipsReceived}</p>
            </div>
            <div className="rounded-xl border border-border bg-card p-4">
              <p className="text-xs text-muted-foreground mb-1">Referral Commissions</p>
              <p className="font-bold text-lg">${earnings.referralCommissions}</p>
            </div>
            <div className="rounded-xl border border-border bg-card p-4">
              <p className="text-xs text-muted-foreground mb-1">Event Revenue</p>
              <p className="font-bold text-lg">${earnings.eventRevenue}</p>
            </div>
          </div>

          <div className="rounded-xl border border-border bg-card p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs text-muted-foreground mb-1">Total Earnings</p>
                <p className="font-bold text-2xl">${earnings.totalEarnings}</p>
              </div>
              <PayoutButton />
            </div>
          </div>

          <div>
            <h2 className="font-semibold text-lg mb-3">Payout History</h2>
            {earnings.payouts.length === 0 ? (
              <div className="rounded-xl border border-border bg-card p-6 text-center">
                <p className="text-muted-foreground text-sm">No payouts yet.</p>
              </div>
            ) : (
              <div className="rounded-xl border border-border overflow-hidden">
                <div className="grid grid-cols-3 bg-muted px-4 py-2 text-xs font-semibold text-muted-foreground">
                  <span>Date</span>
                  <span>Amount</span>
                  <span>Status</span>
                </div>
                {earnings.payouts.map((payout) => (
                  <div
                    key={payout.id}
                    className="grid grid-cols-3 px-4 py-3 border-t border-border items-center text-sm"
                  >
                    <span className="text-muted-foreground">
                      {new Date(payout.created_at).toLocaleDateString()}
                    </span>
                    <span className="font-medium">${payout.amount}</span>
                    <span
                      className={`capitalize ${
                        payout.status === 'completed'
                          ? 'text-green-600'
                          : payout.status === 'pending'
                          ? 'text-yellow-600'
                          : 'text-muted-foreground'
                      }`}
                    >
                      {payout.status}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>

          <p className="text-xs text-muted-foreground">
            Minimum payout: $10.00. Processed via Dodopayments or Paystack.
          </p>
        </div>
      )}
    </div>
  );
}

function PayoutButton() {
  return (
    <form action="/api/earnings/request-payout" method="POST">
      <button
        type="submit"
        className="px-4 py-2 bg-accent text-accent-foreground rounded-lg text-sm font-semibold hover:bg-accent/90 transition-colors"
      >
        Request Payout
      </button>
    </form>
  );
}

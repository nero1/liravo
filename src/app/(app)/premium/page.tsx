import { createClient } from '@/lib/supabase/server';
import { redirect } from 'next/navigation';
import Link from 'next/link';
import type { Metadata } from 'next';

export const metadata: Metadata = { title: 'Go Premium — Liravo' };

const FEATURES = [
  { label: 'Unlimited custom shelves', free: '10 shelves', premium: 'Unlimited' },
  { label: 'Reading statistics dashboard', free: null, premium: 'Full dashboard' },
  { label: 'AI taste profile', free: null, premium: 'Personalised' },
  { label: 'AI writing feedback', free: null, premium: 'On every piece' },
  { label: 'AI writing plan', free: null, premium: 'Weekly plan' },
  { label: 'Email digests', free: null, premium: 'Weekly digest' },
  { label: 'Premium badge', free: null, premium: 'On profile' },
];

export default async function PremiumPage() {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  const { data: profile } = await supabase
    .from('users')
    .select('is_premium, display_name')
    .eq('id', user.id)
    .single();

  const isPremium = (profile as { is_premium?: boolean } | null)?.is_premium ?? false;

  return (
    <div className="max-w-xl mx-auto px-4 py-8">
      <div className="text-center mb-8">
        <div className="text-4xl mb-3">★</div>
        <h1 className="font-display text-3xl font-bold mb-2">Liravo Premium</h1>
        <p className="text-muted-foreground">
          Unlock the full reading and writing experience.
        </p>
      </div>

      {isPremium ? (
        <div className="rounded-xl border border-accent bg-accent/10 p-6 text-center mb-8">
          <div className="text-2xl mb-2">★</div>
          <p className="font-semibold text-lg">You&apos;re Premium!</p>
          <p className="text-muted-foreground text-sm mt-1">
            Enjoy all premium features, {profile?.display_name ?? 'reader'}.
          </p>
        </div>
      ) : (
        <div className="rounded-xl border border-border bg-card p-6 text-center mb-8">
          <p className="text-3xl font-bold mb-1">$4.99</p>
          <p className="text-muted-foreground text-sm">per month</p>
          <UpgradeButtons />
        </div>
      )}

      <div className="rounded-xl border border-border overflow-hidden">
        <div className="grid grid-cols-3 bg-muted px-4 py-2 text-xs font-semibold text-muted-foreground">
          <span>Feature</span>
          <span className="text-center">Free</span>
          <span className="text-center text-accent">Premium</span>
        </div>
        {FEATURES.map((f) => (
          <div
            key={f.label}
            className="grid grid-cols-3 px-4 py-3 border-t border-border items-center"
          >
            <span className="text-sm font-medium">{f.label}</span>
            <span className="text-center text-xs text-muted-foreground">
              {f.free ?? '—'}
            </span>
            <span className="text-center text-xs font-semibold text-accent">
              {f.premium}
            </span>
          </div>
        ))}
      </div>

      <p className="text-center text-xs text-muted-foreground mt-6">
        Cancel anytime. No hidden fees.{' '}
        <Link href="/settings" className="underline">
          Manage subscription
        </Link>
      </p>
    </div>
  );
}

function UpgradeButtons() {
  return (
    <div className="mt-5 space-y-3">
      <UpgradeForm provider="dodopayments" currency="USD" label="Pay with Card (Global)" />
      <UpgradeForm provider="paystack" currency="NGN" label="Pay with Paystack (Nigeria)" />
    </div>
  );
}

function UpgradeForm({
  provider,
  currency,
  label,
}: {
  provider: string;
  currency: string;
  label: string;
}) {
  return (
    <form
      action="/api/subscriptions/create"
      method="POST"
      className="w-full"
    >
      <input type="hidden" name="provider" value={provider} />
      <input type="hidden" name="currency" value={currency} />
      <button
        type="submit"
        className="w-full py-3 bg-accent text-accent-foreground rounded-lg font-semibold hover:bg-accent/90 transition-colors text-sm"
      >
        {label}
      </button>
    </form>
  );
}

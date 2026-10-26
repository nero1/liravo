import { getTranslations, getFormatter } from 'next-intl/server';
import { CsrfInput } from '@/components/layout/CsrfInput';
import { createClient } from '@/lib/supabase/server';
import { redirect } from 'next/navigation';
import Link from 'next/link';
import type { Metadata } from 'next';

export const dynamic = 'force-dynamic';

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('premium');
  return { title: t('pageTitle'), robots: { index: false } };
}

const FEATURES = ['shelves', 'stats', 'taste', 'feedback', 'plan', 'digest', 'badge'] as const;

export default async function PremiumPage({ searchParams }: { searchParams: { payment?: string } }) {
  const t = await getTranslations('premium');
  const formatter = await getFormatter();
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
        <h1 className="font-display text-3xl font-bold mb-2">{t('title')}</h1>
        <p className="text-muted-foreground">
          {t('subtitle')}
        </p>
      </div>

      {searchParams.payment === 'pending' && !isPremium && <p role="status" className="text-center text-sm mb-4">{t('paymentPending')}</p>}
      {isPremium ? (
        <div className="rounded-xl border border-accent bg-accent/10 p-6 text-center mb-8">
          <div className="text-2xl mb-2">★</div>
          <p className="font-semibold text-lg">{t('activeTitle')}</p>
          <p className="text-muted-foreground text-sm mt-1">
            {t('activeMessage', { name: profile?.display_name ?? t('reader') })}
          </p>
        </div>
      ) : (
        <div className="rounded-xl border border-border bg-card p-6 text-center mb-8">
          <p className="text-3xl font-bold mb-1">{formatter.number(4.99, { style: 'currency', currency: 'USD' })}</p>
          <p className="text-muted-foreground text-sm">{t('perMonth')}</p>
          <UpgradeButtons />
        </div>
      )}

      <div className="rounded-xl border border-border overflow-hidden">
        <div className="grid grid-cols-3 bg-muted px-4 py-2 text-xs font-semibold text-muted-foreground">
          <span>{t('feature')}</span>
          <span className="text-center">{t('free')}</span>
          <span className="text-center text-accent">{t('premium')}</span>
        </div>
        {FEATURES.map((f) => (
          <div
            key={f}
            className="grid grid-cols-3 px-4 py-3 border-t border-border items-center"
          >
            <span className="text-sm font-medium">{t(`features.${f}.label`)}</span>
            <span className="text-center text-xs text-muted-foreground">
              {f === 'shelves' ? t('freeShelves') : '—'}
            </span>
            <span className="text-center text-xs font-semibold text-accent">
              {t(`features.${f}.value`)}
            </span>
          </div>
        ))}
      </div>

      <p className="text-center text-xs text-muted-foreground mt-6">
        {t('terms')}{' '}
        <Link href="/settings" className="underline">
          {t('manage')}
        </Link>
      </p>
    </div>
  );
}

async function UpgradeButtons() {
  const t = await getTranslations('premium');
  return (
    <div className="mt-5 space-y-3">
      <UpgradeForm provider="dodopayments" currency="USD" label={t('payCard')} />
      <UpgradeForm provider="paystack" currency="NGN" label={t('payPaystack')} />
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
    ><CsrfInput />
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

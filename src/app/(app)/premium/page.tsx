import { hasPremiumAccess } from '@/lib/premium-access';
import { getTranslations, getFormatter } from 'next-intl/server';
import { CsrfInput } from '@/components/layout/CsrfInput';
import { googlePlayManagementUrl } from '@/lib/google-play';
import { createClient, createServiceClient } from '@/lib/supabase/server';
import { redirect } from 'next/navigation';
import Link from 'next/link';
import type { Metadata } from 'next';
import { CancelSubscriptionButton } from '@/components/creator/CancelSubscriptionButton';

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

  const isPremium = await hasPremiumAccess(user.id);
  const {data:subscriptions,error:subscriptionError}=await createServiceClient().from('subscriptions').select('provider,current_period_end,renewal_cancelled').eq('user_id',user.id).eq('status','active').gt('current_period_end',new Date().toISOString());
  if(subscriptionError||!Array.isArray(subscriptions))throw new Error('Subscription management unavailable');
  const paidUntil=subscriptions.reduce((latest:string|null,item:{current_period_end:string})=>!latest||item.current_period_end>latest?item.current_period_end:latest,null);
  const canCancel=subscriptions.some((item:{provider:string;renewal_cancelled:boolean})=>item.provider==='dodopayments'&&!item.renewal_cancelled);
  const googleManaged=subscriptions.some((item:{provider:string})=>item.provider==='google_play');
  const paystackPass=subscriptions.some((item:{provider:string})=>item.provider==='paystack');


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
          {paidUntil&&<p className="text-sm mt-2">{t('paidUntil',{date:formatter.dateTime(new Date(paidUntil),{dateStyle:'medium'})})}</p>}
          {paystackPass&&<p className="text-sm mt-2">{t('paystackPass')}</p>}
          {canCancel&&<CancelSubscriptionButton />}
          {googleManaged&&<a href={googlePlayManagementUrl()} target="_blank" rel="noopener noreferrer" className="underline text-sm block mt-2">{t('manageGoogle')}</a>}
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
        <Link href="/premium" className="underline">
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

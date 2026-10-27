import { CsrfInput } from '@/components/layout/CsrfInput';
import { getTranslations, getFormatter } from 'next-intl/server';
import { getCurrentUser } from '@/lib/auth/getCurrentUser';
import { createServiceClient } from '@/lib/supabase/server';
import { notFound, redirect } from 'next/navigation';
import { z } from 'zod';

export const dynamic = 'force-dynamic';
export const metadata = { robots: { index: false, follow: false } };

export default async function TipStatusPage({ params,searchParams }: { params: { id: string };searchParams:{verification?:string} }) {
  const user = await getCurrentUser();
  if (!user) redirect('/login');
  if (!z.string().uuid().safeParse(params.id).success) notFound();
  const { data, error } = await createServiceClient().from('tips').select('amount,currency,status,refunded_recipient_amount').eq('id',params.id).eq('user_id',user.id).maybeSingle();
  if (error) throw new Error('Tip status unavailable');
  if (!data) notFound();
  const t = await getTranslations('tips');
  const formatter = await getFormatter();
  const status = data.status==='completed'&&Number(data.refunded_recipient_amount)>0?'partiallyRefunded':['completed','failed','refunded'].includes(data.status)?data.status:'pending';
  return <div className="max-w-lg mx-auto px-4 py-8 space-y-4">
    <h1 className="font-display text-2xl font-bold">{t('statusTitle')}</h1>
    {searchParams.verification==='unavailable'&&<p role="alert">{t('verificationUnavailable')}</p>}
    <p role="status">{t(`status.${status}`, { amount: formatter.number(Number(data.amount), { style: 'currency', currency: data.currency }) })}</p>
    {status==='pending'?<form action="/api/payments/reconcile" method="POST"><CsrfInput /><input type="hidden" name="_return" value={`/tips/${params.id}`} /><button className="underline">{t('refresh')}</button></form>:<a href={`/tips/${params.id}`} className="underline">{t('refresh')}</a>}
  </div>;
}

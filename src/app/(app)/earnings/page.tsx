import { createServiceClient } from '@/lib/supabase/server';
import { getCurrentUser } from '@/lib/auth/getCurrentUser';
import { getCreatorBalance, PAYOUT_CURRENCIES } from '@/lib/earnings';
import { decodeCursor, encodeCursor, cursorFilter } from '@/lib/pagination';
import {readAccountPin} from '@/lib/account-pin';
import { PayoutForm, CancelPayoutButton } from '@/components/creator/PayoutForm';
import { getTranslations, getFormatter } from 'next-intl/server';
import { redirect } from 'next/navigation';
import Link from 'next/link';
import type { Metadata } from 'next';

export const dynamic='force-dynamic';
export async function generateMetadata():Promise<Metadata> {return {title:(await getTranslations('earnings'))('pageTitle'),robots:{index:false}};}
export default async function EarningsPage(props:{searchParams: Promise<{currency?:string;cursor?:string}>}) {
  const searchParams = (await props.searchParams)??{};
  const user=await getCurrentUser();if(!user)redirect('/login');
  const t=await getTranslations('earnings');const formatter=await getFormatter();
  const currency=PAYOUT_CURRENCIES.find(value=>value===searchParams.currency)??'USD';
  let content;
  try {
    const cursor=decodeCursor(searchParams.cursor??null);
    const summary=await getCreatorBalance(user.id,currency);
    let query=createServiceClient().from('payout_requests').select('id,amount,status,created_at').eq('user_id',user.id).eq('currency',currency).order('created_at',{ascending:false}).order('id',{ascending:false}).limit(51);
    if(cursor)query=query.or(cursorFilter('created_at',cursor));
    const {data,error}=await query;if(error||!Array.isArray(data))throw new Error('Payout history unavailable');
    const payouts=data.slice(0,50);const last=payouts.at(-1);
    const price=(value:string|number)=>formatter.number(Number(value),{style:'currency',currency});
    content=<div className="space-y-6">
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">{(['tips','referrals','events','earned','reserved','paid','available'] as const).map(key=><div key={key} className="rounded-xl border border-border bg-card p-4"><p className="text-xs text-muted-foreground mb-1">{t(key)}</p><p className="font-bold text-lg">{price(summary[key])}</p></div>)}</div>
      <PayoutForm key={user.id+':'+currency} ownerId={user.id} requirePin={!!(await readAccountPin(user.id))} currency={currency} available={summary.available}/>
      <section aria-labelledby="history-heading"><h2 id="history-heading" className="font-semibold text-lg mb-3">{t('history')}</h2>
        {!payouts.length?<p className="text-muted-foreground">{t('empty')}</p>:<div className="overflow-x-auto"><table className="w-full text-sm text-left"><thead><tr>{(['date','amount','status'] as const).map(key=><th key={key} scope="col" className="p-3">{t(key)}</th>)}</tr></thead><tbody>{payouts.map(payout=><tr key={payout.id} className="border-t border-border"><td className="p-3">{formatter.dateTime(new Date(payout.created_at),{dateStyle:'medium'})}</td><td className="p-3">{price(payout.amount)}</td><td className="p-3">{t(`statuses.${payout.status}`)}{payout.status==='pending'&&<CancelPayoutButton id={payout.id}/>}</td></tr>)}</tbody></table></div>}
        {data.length>50&&last&&<Link className="block mt-4 underline" href={`/earnings?currency=${currency}&cursor=${encodeURIComponent(encodeCursor({at:last.created_at,id:last.id}))}`}>{t('next')}</Link>}
      </section>
    </div>;
  }catch {content=<p role="alert">{t('unavailable')}</p>;}
  return <div className="max-w-2xl mx-auto px-4 py-6"><h1 className="font-display text-2xl font-bold mb-6">{t('title')}</h1><nav aria-label={t('currency')} className="flex gap-4 mb-6">{PAYOUT_CURRENCIES.map(value=><Link key={value} href={`/earnings?currency=${value}`} aria-current={value===currency?'page':undefined} className={value===currency?'font-semibold underline':''}>{value}</Link>)}</nav>{content}</div>;
}

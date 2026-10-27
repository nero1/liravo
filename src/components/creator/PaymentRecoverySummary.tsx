import { getTranslations,getFormatter } from 'next-intl/server';
import type { PaymentRecovery } from '@/lib/payment-recovery';

export async function PaymentRecoverySummary({rows}:{rows:PaymentRecovery[]}){
  if(!rows.length)return null;
  const t=await getTranslations('paymentRecovery'),format=await getFormatter();
  return <details open={rows.some(row=>row.charged_minor>row.refunded_minor)} className="border border-border rounded-lg p-4 space-y-2">
    <summary className="font-medium cursor-pointer">{t('title')}</summary>
    {rows.map(row=>{
      const money=(minor:number)=>format.number(minor/100,{style:'currency',currency:row.currency});
      return <div key={row.currency} className="text-sm space-y-1"><p>{t('captured',{count:row.count,amount:money(row.charged_minor)})}</p>
        {row.refunded_minor>0&&<p>{t('refunded',{amount:money(row.refunded_minor)})}</p>}
        {row.charged_minor>row.refunded_minor&&<p role="status">{t('pending',{amount:money(row.charged_minor-row.refunded_minor)})}</p>}
      </div>;
    })}
  </details>;
}

import { createServiceClient } from '@/lib/supabase/server';
import { getCurrentUser } from '@/lib/auth/getCurrentUser';
import { notFound,redirect } from 'next/navigation';
import { getTranslations,getFormatter } from 'next-intl/server';
import { CsrfInput } from '@/components/layout/CsrfInput';
import { validateCheckoutUrl } from '@/lib/payment-providers';
import { z } from 'zod';
import Link from 'next/link';
import type { Metadata } from 'next';

export const dynamic='force-dynamic';
export async function generateMetadata():Promise<Metadata>{const t=await getTranslations('events');return {title:t('viewTicket'),robots:{index:false,follow:false}};}
export default async function TicketPage(
  props:{params: Promise<{id:string}>;searchParams: Promise<{verification?:string}>}
) {
  const searchParams = (await props.searchParams)??{};
  const params = await props.params;
  const user=await getCurrentUser();if(!user)redirect('/login');
  if(!z.string().uuid().safeParse(params.id).success)notFound();
  const {data:ticket,error}=await createServiceClient().from('event_tickets').select('id,event_id,status,amount_paid,currency,reserved_until,checkout_url,provider,event:events(title)').eq('id',params.id).eq('user_id',user.id).maybeSingle();
  if(error)throw new Error('Ticket unavailable');if(!ticket)notFound();
  const t=await getTranslations('events'),format=await getFormatter();
  const status=ticket.status==='pending'&&ticket.reserved_until&&Date.parse(ticket.reserved_until)<=Date.now()?'expired':ticket.status;
  let checkout:string|null=null;
  if(status==='pending'&&ticket.checkout_url){try{checkout=validateCheckoutUrl(ticket.provider,ticket.checkout_url);}catch{}}
  const event=ticket.event as unknown as {title:string}|null;
  return <div className="max-w-xl mx-auto px-4 py-8 space-y-4">
    <h1 className="font-display text-2xl font-bold">{event?.title??t('event')}</h1>
    <p>{format.number(Number(ticket.amount_paid),{style:'currency',currency:ticket.currency})}</p>
    <p role="status">{t(`ticket_${status}`)}</p>
    {status==='pending'&&ticket.reserved_until&&<p>{t('reservationUntil',{date:format.dateTime(new Date(ticket.reserved_until),{dateStyle:'medium',timeStyle:'short'})})}</p>}
    {searchParams.verification&&<p role="alert">{t('verificationUnavailable')}</p>}
    {checkout&&<a href={checkout} className="text-accent underline">{t('continueCheckout')}</a>}
    {['pending','expired'].includes(status)&&<form action="/api/payments/reconcile" method="POST"><CsrfInput /><input type="hidden" name="_return" value={`/tickets/${ticket.id}`} /><button className="rounded-lg bg-accent text-white px-4 py-2">{t('checkPayment')}</button></form>}
    <Link href={`/events/${ticket.event_id}`} className="block text-accent underline">{t('backToEvent')}</Link>
  </div>;
}

import { CsrfInput } from '@/components/layout/CsrfInput';
import { getCurrentUser } from '@/lib/auth/getCurrentUser';
import { readEvent } from '@/services/events';
import { notFound } from 'next/navigation';
import { getTranslations,getFormatter } from 'next-intl/server';
import { z } from 'zod';
import Link from 'next/link';
import type { Metadata } from 'next';

export const dynamic='force-dynamic';
export async function generateMetadata():Promise<Metadata>{const t=await getTranslations('events');return {title:t('event')};}
export default async function EventDetailPage({params,searchParams}:{params:{id:string};searchParams:{error?:string}}){
  if(!z.string().uuid().safeParse(params.id).success)notFound();
  const user=await getCurrentUser(),event=await readEvent(params.id,user?.id);
  if(!event)notFound();
  const t=await getTranslations('events'),format=await getFormatter();
  const past=new Date(event.event_date)<=new Date(),ticket=event.ticket;
  const price=format.number(event.price??0,{style:'currency',currency:event.currency??'USD'});
  return <div className="max-w-2xl mx-auto px-4 py-8 space-y-6">
    <div><h1 className="font-display text-2xl font-bold">{event.title}</h1>
      <p className="text-sm text-muted-foreground">{event.is_paid?price:t('free')}{past?` · ${t('pastEvent')}`:''}</p>
      <p>{format.dateTime(new Date(event.event_date),{dateStyle:'full',timeStyle:'short'})}</p>
      {event.host&&<p>{t('hostedBy')} <Link href={`/user/${event.host.username}`} className="text-accent hover:underline">{event.host.display_name}</Link></p>}
      {event.book&&<p>{t('aboutBook')} <Link href={`/book/${event.book.id}`} className="text-accent hover:underline">{event.book.title}</Link></p>}
      {event.max_attendees&&<p>{t('attendees',{count:event.attendee_count,max:event.max_attendees})}</p>}
    </div>
    <div className="rounded-xl border border-border p-4"><h2 className="font-semibold mb-2">{t('aboutEvent')}</h2><p className="whitespace-pre-line text-sm">{event.description}</p></div>
    {searchParams.error&&<p role="alert">{t('checkoutUnavailable')}</p>}
    {ticket&&<p role="status">{t(`ticket_${ticket.status}`)}</p>}
    {ticket&&<Link href={`/tickets/${ticket.id}`} className="text-accent underline">{t('viewTicket')}</Link>}
    {user&&!past&&(!event.is_paid?!event.has_rsvp:event.can_purchase&&(!ticket||['expired','refunded'].includes(ticket.status)))&&<form action={`/api/events/${params.id}/${event.is_paid?'ticket':'rsvp'}`} method="POST"><CsrfInput /><input type="hidden" name="_idempotency" value={crypto.randomUUID()} /><button className="w-full py-3 rounded-lg bg-accent text-white font-semibold">{event.is_paid?t('buyTicket',{price}):t('rsvpFree')}</button></form>}
    {user&&!event.is_paid&&event.has_rsvp&&<p role="status">{t('rsvpConfirmed')}</p>}
    {!user&&<Link href="/login" className="text-accent underline">{t('signIn')}</Link>}
  </div>;
}

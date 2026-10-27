import { createClient } from '@/lib/supabase/server';
import Link from 'next/link';
import type { Metadata } from 'next';
import { getTranslations,getFormatter } from 'next-intl/server';
import { getCurrentUser } from '@/lib/auth/getCurrentUser';

export const dynamic = 'force-dynamic';
export async function generateMetadata():Promise<Metadata>{const t=await getTranslations('events');return {title:t('title')};}

interface Event {
  id: string;
  title: string;
  description: string;
  event_date: string;
  is_paid: boolean;
  price: number | null;
  currency: string;
  host_id: string;
  book_id: string | null;
  max_attendees: number | null;
  created_at: string;
}

export default async function EventsPage() {
  const supabase = createClient();
  const user=await getCurrentUser();
  const t=await getTranslations('events'),formatter=await getFormatter();

  const now = new Date().toISOString();

  const { data: eventsRaw,error } = await supabase
    .from('events')
    .select('id, title, description, event_date, is_paid, price:ticket_price, currency, host_id:organizer_id, book_id, max_attendees, created_at')
    .gte('event_date', now)
    .order('event_date', { ascending: true })
    .limit(30);

  if(error)throw new Error('Events unavailable');
  const events: Event[] = eventsRaw ?? [];

  // Get host names
  const hostIds = Array.from(new Set(events.map((e) => e.host_id)));
  const hostMap: Record<string, { display_name: string; username: string }> = {};
  if (hostIds.length > 0) {
    const { data: hosts } = await supabase
      .from('users')
      .select('id, display_name, username')
      .in('id', hostIds);
    for (const h of hosts ?? []) {
      hostMap[h.id] = { display_name: h.display_name, username: h.username };
    }
  }

  // Check if current user can create events
  let canCreate = false;
  if (user) {
    const { data: profile } = await supabase
      .from('users')
      .select('is_admin, is_verified_author, user_types')
      .eq('id', user.id)
      .single();

    canCreate =
      profile?.is_admin ||
      profile?.is_verified_author ||
      (profile?.user_types ?? []).includes('author') ||
      (profile?.user_types ?? []).includes('creator');
  }

  return (
    <div className="max-w-2xl mx-auto px-4 py-8 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="font-display text-2xl font-bold">{t('title')}</h1>
          <p className="text-neutral-500 dark:text-neutral-400 text-sm mt-1">
            {t('subtitle')}
          </p>
        </div>
        {canCreate && (
          <Link
            href="/events/new"
            className="px-4 py-2 rounded-lg bg-accent text-white text-sm font-semibold hover:opacity-90"
          >
            {t('createEvent')}
          </Link>
        )}
      </div>

      {events.length === 0 ? (
        <div className="text-center py-12">
          <p className="text-neutral-500 dark:text-neutral-400">{t('noEvents')}</p>
        </div>
      ) : (
        <div className="space-y-4">
          {events.map((event) => {
            const host = hostMap[event.host_id];
            const date = new Date(event.event_date);
            return (
              <Link
                key={event.id}
                href={`/events/${event.id}`}
                className="block rounded-xl border border-neutral-200 dark:border-neutral-700 bg-white dark:bg-neutral-900 p-4 hover:border-accent transition-colors"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1 flex-wrap">
                      <h2 className="font-semibold">{event.title}</h2>
                      {event.is_paid ? (
                        <span className="text-xs font-medium px-2 py-0.5 rounded-full bg-accent/10 text-accent">
                          {formatter.number(Number(event.price??0),{style:'currency',currency:event.currency})}
                        </span>
                      ) : (
                        <span className="text-xs font-medium px-2 py-0.5 rounded-full bg-green-100 text-green-700 dark:bg-green-900 dark:text-green-300">
                          {t('free')}
                        </span>
                      )}
                    </div>
                    <p className="text-sm text-neutral-600 dark:text-neutral-400 line-clamp-2">
                      {event.description}
                    </p>
                    <div className="flex items-center gap-3 mt-2 text-xs text-neutral-500">
                      <span>
                        {formatter.dateTime(date,{dateStyle:'medium',timeStyle:'short'})}
                      </span>
                      {host && <span>{t('hostedBy')} {host.display_name}</span>}
                    </div>
                  </div>
                </div>
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}

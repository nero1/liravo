import { createClient } from '@/lib/supabase/server';
import { notFound } from 'next/navigation';
import Link from 'next/link';
import type { Metadata } from 'next';

export const dynamic = 'force-dynamic';

export async function generateMetadata(): Promise<Metadata> {
  return { title: 'Event' };
}

export default async function EventDetailPage({
  params,
}: {
  params: { id: string };
}) {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { data: event } = await supabase
    .from('events')
    .select('id, title, description, event_date, is_paid, price, currency, host_id, book_id, max_attendees, created_at')
    .eq('id', params.id)
    .single();

  if (!event) notFound();

  const { data: host } = await supabase
    .from('users')
    .select('id, display_name, username, avatar_url, is_verified_author')
    .eq('id', event.host_id)
    .single();

  const { data: book } = event.book_id
    ? await supabase
        .from('books')
        .select('id, title, author_name')
        .eq('id', event.book_id)
        .single()
    : { data: null };

  // Check RSVP status
  let hasRsvped = false;
  let hasTicket = false;
  if (user) {
    if (!event.is_paid) {
      const { data: rsvp } = await supabase
        .from('event_rsvps')
        .select('id')
        .eq('event_id', params.id)
        .eq('user_id', user.id)
        .single();
      hasRsvped = !!rsvp;
    } else {
      const { data: ticket } = await supabase
        .from('event_tickets')
        .select('id, status')
        .eq('event_id', params.id)
        .eq('user_id', user.id)
        .single();
      hasTicket = !!ticket;
    }
  }

  // RSVP count
  const { count: rsvpCount } = await supabase
    .from('event_rsvps')
    .select('id', { count: 'exact', head: true })
    .eq('event_id', params.id);

  const date = new Date(event.event_date);
  const isPast = date < new Date();

  return (
    <div className="max-w-2xl mx-auto px-4 py-8 space-y-6">
      {/* Event header */}
      <div>
        <div className="flex items-start gap-2 mb-2 flex-wrap">
          <h1 className="font-display text-2xl font-bold">{event.title}</h1>
          {event.is_paid ? (
            <span className="text-xs font-medium px-2 py-0.5 rounded-full bg-accent/10 text-accent self-center">
              {event.currency} {event.price?.toFixed(2)}
            </span>
          ) : (
            <span className="text-xs font-medium px-2 py-0.5 rounded-full bg-green-100 text-green-700 dark:bg-green-900 dark:text-green-300 self-center">
              Free
            </span>
          )}
          {isPast && (
            <span className="text-xs font-medium px-2 py-0.5 rounded-full bg-neutral-100 text-neutral-500 dark:bg-neutral-800 self-center">
              Past Event
            </span>
          )}
        </div>

        <p className="text-sm text-neutral-600 dark:text-neutral-400">
          {date.toLocaleDateString('en-US', {
            weekday: 'long',
            month: 'long',
            day: 'numeric',
            year: 'numeric',
          })}{' '}
          at{' '}
          {date.toLocaleTimeString('en-US', {
            hour: 'numeric',
            minute: '2-digit',
          })}
        </p>

        {host && (
          <p className="text-sm text-neutral-500 dark:text-neutral-400 mt-1">
            Hosted by{' '}
            <Link
              href={`/profile/${host.username}`}
              className="text-accent hover:underline font-medium"
            >
              {host.display_name}
            </Link>
          </p>
        )}

        {book && (
          <p className="text-sm text-neutral-500 dark:text-neutral-400 mt-1">
            About{' '}
            <Link href={`/book/${book.id}`} className="text-accent hover:underline font-medium">
              {book.title}
            </Link>
          </p>
        )}

        {event.max_attendees && (
          <p className="text-sm text-neutral-500 dark:text-neutral-400 mt-1">
            {rsvpCount ?? 0} / {event.max_attendees} attendees
          </p>
        )}
      </div>

      {/* Description */}
      <div className="rounded-xl border border-neutral-200 dark:border-neutral-700 bg-white dark:bg-neutral-900 p-4">
        <h2 className="font-semibold mb-2">About This Event</h2>
        <p className="text-sm text-neutral-700 dark:text-neutral-300 whitespace-pre-line">
          {event.description}
        </p>
      </div>

      {/* CTA */}
      {user && !isPast && (
        <div>
          {!event.is_paid ? (
            hasRsvped ? (
              <div className="flex items-center gap-2 p-3 rounded-lg bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800">
                <span className="text-green-700 dark:text-green-300 text-sm font-medium">
                  You are registered for this event.
                </span>
              </div>
            ) : (
              <form action={`/api/events/${params.id}/rsvp`} method="POST">
                <button
                  type="submit"
                  className="w-full py-3 rounded-lg bg-accent text-white font-semibold hover:opacity-90 transition-opacity"
                >
                  RSVP — Free
                </button>
              </form>
            )
          ) : hasTicket ? (
            <div className="flex items-center gap-2 p-3 rounded-lg bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800">
              <span className="text-green-700 dark:text-green-300 text-sm font-medium">
                You have a ticket for this event.
              </span>
            </div>
          ) : (
            <form action={`/api/events/${params.id}/ticket`} method="POST">
              <button
                type="submit"
                className="w-full py-3 rounded-lg bg-accent text-white font-semibold hover:opacity-90 transition-opacity"
              >
                Buy Ticket — {event.currency} {event.price?.toFixed(2)}
              </button>
            </form>
          )}
        </div>
      )}

      {!user && (
        <div className="text-center">
          <Link
            href="/auth/login"
            className="px-6 py-3 rounded-lg bg-accent text-white font-semibold hover:opacity-90 transition-opacity inline-block"
          >
            Sign in to RSVP
          </Link>
        </div>
      )}
    </div>
  );
}

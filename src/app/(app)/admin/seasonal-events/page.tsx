import { createClient } from '@/lib/supabase/server';
import { redirect } from 'next/navigation';
import Link from 'next/link';
import type { Metadata } from 'next';

export const metadata: Metadata = { title: 'Seasonal Events — Admin' };

interface SeasonalEvent {
  id: string;
  name: string;
  theme: string | null;
  start_date: string;
  end_date: string;
  badge_name: string | null;
  is_published: boolean;
}

export default async function SeasonalEventsPage() {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  const { data: profile } = await supabase.from('users').select('is_admin').eq('id', user.id).single();
  if (!profile?.is_admin) redirect('/');

  const { data: events } = await supabase
    .from('seasonal_events')
    .select('id, name, theme, start_date, end_date, badge_name, is_published')
    .order('start_date', { ascending: false })
    .limit(50);

  const items = (events ?? []) as SeasonalEvent[];
  const now = new Date();

  return (
    <div className="max-w-4xl mx-auto px-4 py-6">
      <div className="flex items-center justify-between mb-6">
        <h1 className="font-display text-2xl font-bold">Seasonal Events</h1>
        <Link
          href="/admin/seasonal-events/new"
          className="px-4 py-2 bg-accent text-accent-foreground rounded-lg text-sm font-medium hover:bg-accent/90 transition-colors"
        >
          + New Event
        </Link>
      </div>

      {items.length === 0 ? (
        <p className="text-muted-foreground text-sm">No seasonal events yet. Create one to get started.</p>
      ) : (
        <div className="space-y-3">
          {items.map((event) => {
            const isActive =
              event.is_published &&
              new Date(event.start_date) <= now &&
              new Date(event.end_date) >= now;
            const isPast = new Date(event.end_date) < now;

            return (
              <div key={event.id} className="border border-border rounded-xl p-4 flex items-center justify-between gap-4">
                <div>
                  <div className="flex items-center gap-2 mb-1">
                    <span className="font-medium">{event.name}</span>
                    <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${
                      isActive
                        ? 'bg-green-500/10 text-green-700 dark:text-green-400'
                        : isPast
                          ? 'bg-muted text-muted-foreground'
                          : event.is_published
                            ? 'bg-blue-500/10 text-blue-700 dark:text-blue-400'
                            : 'bg-amber-500/10 text-amber-700 dark:text-amber-400'
                    }`}>
                      {isActive ? 'Active' : isPast ? 'Past' : event.is_published ? 'Upcoming' : 'Draft'}
                    </span>
                  </div>
                  {event.theme && <p className="text-sm text-muted-foreground">{event.theme}</p>}
                  <p className="text-xs text-muted-foreground mt-1">
                    {new Date(event.start_date).toLocaleDateString()} — {new Date(event.end_date).toLocaleDateString()}
                    {event.badge_name && ` · Badge: ${event.badge_name}`}
                  </p>
                </div>
                <Link
                  href={`/admin/seasonal-events/${event.id}/edit`}
                  className="shrink-0 text-xs text-muted-foreground hover:text-foreground transition-colors"
                >
                  Edit
                </Link>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

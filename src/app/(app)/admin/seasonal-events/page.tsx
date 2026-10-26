import { getCurrentUser } from '@/lib/auth/getCurrentUser';
import { isAdmin } from '@/lib/moderation';
import { getTranslations, getFormatter } from 'next-intl/server';
import { createServiceClient } from '@/lib/supabase/server';
import { redirect } from 'next/navigation';
import Link from 'next/link';
import type { Metadata } from 'next';

export const dynamic = 'force-dynamic';

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('admin');
  return { title: t('seasonalEvents') };
}

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
  const formatter = await getFormatter();
  const t = await getTranslations('admin');
  const user = await getCurrentUser();
  if (!user) redirect('/login');
  if (!await isAdmin(user.id)) redirect('/');
  const supabase = createServiceClient();

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
        <h1 className="font-display text-2xl font-bold">{t('seasonalEvents')}</h1>
        <Link
          href="/admin/seasonal-events/new"
          className="px-4 py-2 bg-accent text-accent-foreground rounded-lg text-sm font-medium hover:bg-accent/90 transition-colors"
        >{t('newEvent')}</Link>
      </div>

      {items.length === 0 ? (
        <p className="text-muted-foreground text-sm">{t('noSeasonalEventsYetCreateOneToGetStarted')}</p>
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
                      {isActive ? t('active') : isPast ? t('past') : event.is_published ? t('upcoming') : t('draft')}
                    </span>
                  </div>
                  {event.theme && <p className="text-sm text-muted-foreground">{event.theme}</p>}
                  <p className="text-xs text-muted-foreground mt-1">
                    {formatter.dateTime(new Date(event.start_date), { dateStyle: 'medium' })} — {formatter.dateTime(new Date(event.end_date), { dateStyle: 'medium' })}
                    {event.badge_name && ` · Badge: ${event.badge_name}`}
                  </p>
                </div>
                <Link
                  href={`/admin/seasonal-events/${event.id}/edit`}
                  className="shrink-0 text-xs text-muted-foreground hover:text-foreground transition-colors"
                >{t('edit')}</Link>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

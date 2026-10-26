import { getCurrentUser } from '@/lib/auth/getCurrentUser';
import { isAdmin } from '@/lib/moderation';
import { getTranslations, getFormatter } from 'next-intl/server';
import { createServiceClient } from '@/lib/supabase/server';
import { redirect } from 'next/navigation';
import type { Metadata } from 'next';

export const dynamic = 'force-dynamic';

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('admin');
  return { title: t('promotedListings') };
}

interface Listing {
  id: string;
  book_id: string;
  is_active: boolean;
  start_date: string | null;
  end_date: string | null;
  clicks: number;
  price_usd: number | null;
  created_at: string;
  book: { title: string; author_name: string } | null;
}

export default async function PromotedListingsPage() {
  const formatter = await getFormatter();
  const t = await getTranslations('admin');
  const user = await getCurrentUser();
  if (!user) redirect('/login');
  if (!await isAdmin(user.id)) redirect('/');
  const supabase = createServiceClient();

  const { data: listings } = await supabase
    .from('promoted_listings')
    .select('id, book_id, is_active, start_date, end_date, clicks, price_usd, created_at, book:books(title, author_name)')
    .order('created_at', { ascending: false })
    .limit(100);

  const items = (listings ?? []) as unknown as Listing[];
  const now = new Date();

  return (
    <div className="max-w-5xl mx-auto px-4 py-6">
      <h1 className="font-display text-2xl font-bold mb-6">{t('promotedListings')}</h1>

      {items.length === 0 ? (
        <p className="text-muted-foreground text-sm">{t('noPromotedListingsYet')}</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm border-collapse">
            <thead>
              <tr className="border-b border-border">
                <th scope="col" className="text-left py-2 pr-4">{t('book')}</th>
                <th scope="col" className="text-left py-2 pr-4">{t('status')}</th>
                <th scope="col" className="text-left py-2 pr-4">{t('dates')}</th>
                <th scope="col" className="text-right py-2 pr-4">{t('clicks')}</th>
                <th scope="col" className="text-right py-2">{t('price')}</th>
              </tr>
            </thead>
            <tbody>
              {items.map((listing) => {
                const isLive =
                  listing.is_active &&
                  listing.start_date && listing.end_date &&
                  new Date(listing.start_date) <= now &&
                  new Date(listing.end_date) >= now;

                return (
                  <tr key={listing.id} className="border-b border-border/50 hover:bg-muted/30">
                    <td className="py-3 pr-4">
                      <p className="font-medium">{listing.book?.title ?? listing.book_id}</p>
                      <p className="text-xs text-muted-foreground">{listing.book?.author_name}</p>
                    </td>
                    <td className="py-3 pr-4">
                      <span className={`inline-block text-xs px-2 py-0.5 rounded-full font-medium ${
                        isLive
                          ? 'bg-green-500/10 text-green-700 dark:text-green-400'
                          : listing.is_active
                            ? 'bg-amber-500/10 text-amber-700 dark:text-amber-400'
                            : 'bg-muted text-muted-foreground'
                      }`}>
                        {isLive ? t('live') : listing.is_active ? t('scheduled') : t('inactive')}
                      </span>
                    </td>
                    <td className="py-3 pr-4 text-xs text-muted-foreground">
                      {listing.start_date ? formatter.dateTime(new Date(listing.start_date), { dateStyle: 'medium' }) : '—'}
                      {' → '}
                      {listing.end_date ? formatter.dateTime(new Date(listing.end_date), { dateStyle: 'medium' }) : '—'}
                    </td>
                    <td className="py-3 pr-4 text-right">{listing.clicks}</td>
                    <td className="py-3 text-right">
                      {listing.price_usd != null ? formatter.number(Number(listing.price_usd), { style: 'currency', currency: 'USD' }) : '—'}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      <p className="text-xs text-muted-foreground mt-6">{t('activationHelp', { endpoint: 'POST /api/admin/promoted-listings' })}</p>
    </div>
  );
}

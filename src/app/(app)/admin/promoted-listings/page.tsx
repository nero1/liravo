import { createClient } from '@/lib/supabase/server';
import { redirect } from 'next/navigation';
import type { Metadata } from 'next';

export const metadata: Metadata = { title: 'Promoted Listings — Admin' };

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
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  const { data: profile } = await supabase
    .from('users')
    .select('is_admin')
    .eq('id', user.id)
    .single();

  if (!profile?.is_admin) redirect('/');

  const { data: listings } = await supabase
    .from('promoted_listings')
    .select('id, book_id, is_active, start_date, end_date, clicks, price_usd, created_at, book:books(title, author_name)')
    .order('created_at', { ascending: false })
    .limit(100);

  const items = (listings ?? []) as unknown as Listing[];
  const now = new Date();

  return (
    <div className="max-w-5xl mx-auto px-4 py-6">
      <h1 className="font-display text-2xl font-bold mb-6">Promoted Listings</h1>

      {items.length === 0 ? (
        <p className="text-muted-foreground text-sm">No promoted listings yet.</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm border-collapse">
            <thead>
              <tr className="border-b border-border">
                <th className="text-left py-2 pr-4">Book</th>
                <th className="text-left py-2 pr-4">Status</th>
                <th className="text-left py-2 pr-4">Dates</th>
                <th className="text-right py-2 pr-4">Clicks</th>
                <th className="text-right py-2">Price</th>
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
                        {isLive ? 'Live' : listing.is_active ? 'Scheduled' : 'Inactive'}
                      </span>
                    </td>
                    <td className="py-3 pr-4 text-xs text-muted-foreground">
                      {listing.start_date ? new Date(listing.start_date).toLocaleDateString() : '—'}
                      {' → '}
                      {listing.end_date ? new Date(listing.end_date).toLocaleDateString() : '—'}
                    </td>
                    <td className="py-3 pr-4 text-right">{listing.clicks}</td>
                    <td className="py-3 text-right">
                      {listing.price_usd != null ? `$${listing.price_usd}` : '—'}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      <p className="text-xs text-muted-foreground mt-6">
        To activate a listing, use the API route <code>POST /api/admin/promoted-listings</code> with the listing ID and activation dates.
        Activation will be automated when payment webhook integration is complete (Phase 7).
      </p>
    </div>
  );
}

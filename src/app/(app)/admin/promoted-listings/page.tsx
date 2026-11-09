import { CsrfInput } from '@/components/layout/CsrfInput';
import { getCurrentUser } from '@/lib/auth/getCurrentUser';
import { isAdmin } from '@/lib/moderation';
import { getTranslations, getFormatter } from 'next-intl/server';
import {readAdminCatalog} from '@/lib/admin-catalog';
import {CatalogPager} from '@/components/admin/CatalogPager';
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

export default async function PromotedListingsPage(props:{searchParams?: Promise<{error?:string;cursor?:string}>}) {
  const searchParams = (await props.searchParams)??{};
  const formatter = await getFormatter();
  const t = await getTranslations('admin');
  const user = await getCurrentUser();
  if (!user) redirect('/login');
  if (!(await isAdmin(user.id))) redirect('/');
  const catalog=await readAdminCatalog<Listing>(user.id,'promotions',{cursor:searchParams.cursor}),items=catalog.items,action='/api/admin/promoted-listings'+(searchParams.cursor?'?cursor='+encodeURIComponent(searchParams.cursor):'');
  const now = new Date();

  return (
    <div className="max-w-5xl mx-auto px-4 py-6">
      <h1 className="font-display text-2xl font-bold mb-6">{t('promotedListings')}</h1>
      {searchParams.error&&<p role="alert" className="text-sm mb-4">{t('promotionUpdateFailed')}</p>}

      {items.length === 0 ? (
        <p className="text-muted-foreground text-sm">{catalog.total?t('noEntriesOnPage'):t('noPromotedListingsYet')}</p>
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
                <th scope="col" className="text-left py-2">{t('actions')}</th>
              </tr>
            </thead>
            <tbody>
              {items.map((listing) => {
                const isLive =
                  listing.is_active &&
                  listing.start_date && listing.end_date &&
                  new Date(listing.start_date) <= now &&
                  new Date(listing.end_date) > now;

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
                        {isLive?t('live'):listing.is_active&&listing.end_date&&new Date(listing.end_date)<now?t('expired'):listing.is_active?t('scheduled'):t('inactive')}
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
                    <td className="py-3 pl-4 space-y-2">
                      <form action={action} method="POST"><CsrfInput />
                        <input type="hidden" name="_action" value="update" /><input type="hidden" name="id" value={listing.id} /><input type="hidden" name="_idempotency" value={crypto.randomUUID()} /><input type="hidden" name="is_active" value={String(!listing.is_active)} />
                        <button className="underline text-sm">{listing.is_active?t('deactivate'):t('activate')}</button>
                      </form>
                      <form action={action} method="POST" className="space-y-2"><CsrfInput />
                        <input type="hidden" name="_action" value="update" /><input type="hidden" name="id" value={listing.id} /><input type="hidden" name="_idempotency" value={crypto.randomUUID()} />
                        <label className="block text-xs">{t('promotionStartUtc')}<input type="datetime-local" name="start_date" required defaultValue={listing.start_date?new Date(listing.start_date).toISOString().slice(0,16):''} className="block border rounded p-1 bg-background" /></label>
                        <label className="block text-xs">{t('promotionEndUtc')}<input type="datetime-local" name="end_date" required defaultValue={listing.end_date?new Date(listing.end_date).toISOString().slice(0,16):''} className="block border rounded p-1 bg-background" /></label>
                        <button className="underline text-sm">{t('savePromotionDates')}</button>
                      </form>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      <CatalogPager base="/admin/promoted-listings" total={catalog.total} cursor={searchParams.cursor} nextCursor={catalog.nextCursor}/>
      <p className="text-xs text-muted-foreground mt-6">{t('activationHelp')}</p>
    </div>
  );
}

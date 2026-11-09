import { getCurrentUser } from '@/lib/auth/getCurrentUser';
import { isAdmin } from '@/lib/moderation';
import { getTranslations,getFormatter } from 'next-intl/server';
import {readAdminCatalog} from '@/lib/admin-catalog';
import {CatalogPager} from '@/components/admin/CatalogPager';
import Link from 'next/link';
import type {BookRow} from '@/types/database';
import { redirect } from 'next/navigation';
import type { Metadata } from 'next';
import { AudiobookToggle } from './AudiobookToggle';

export const dynamic = 'force-dynamic';

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('admin');
  return { title: t('bookManagement') };
}

export default async function AdminBooksPage(props:{searchParams?: Promise<{cursor?:string;search?:string}>}) {
  const searchParams = (await props.searchParams)??{};
  const t = await getTranslations('admin'),common=await getTranslations('common'),formatter=await getFormatter(),bookText=await getTranslations('books'),editionText=await getTranslations('editions');
  const user = await getCurrentUser();
  if (!user) redirect('/login');
  if (!(await isAdmin(user.id))) redirect('/');
  const catalog=await readAdminCatalog<BookRow&{affiliate_click_count:number}>(user.id,'books',{cursor:searchParams.cursor,search:searchParams.search}),books=catalog.items;

  return (
    <div className="max-w-5xl mx-auto px-4 py-6">
      <h1 className="font-display text-2xl font-bold mb-6">{t('bookManagement')}</h1>
      <form method="GET" role="search" className="mb-4 flex gap-2"><input type="search" name="search" aria-label={bookText('search')} placeholder={bookText('search')} defaultValue={searchParams.search??''} maxLength={200} className="flex-1 rounded-lg border border-border bg-background px-3 py-2 text-sm"/><button className="rounded-lg bg-accent px-4 py-2 text-sm text-accent-foreground">{common('search')}</button></form>
      <p className="text-sm text-muted-foreground mb-4">{t('bookManagementDescription')}</p>

      <div className="rounded-xl border border-border overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-muted">
            <tr>
              <th scope="col" className="text-left px-4 py-3 font-semibold text-muted-foreground">{t('book')}</th>
              <th scope="col" className="text-left px-4 py-3 font-semibold text-muted-foreground">{t('author')}</th>
              <th scope="col" className="text-left px-4 py-3 font-semibold text-muted-foreground">{t('source')}</th>
              <th scope="col" className="text-center px-4 py-3 font-semibold text-muted-foreground">{t('affiliateClicks')}</th>
              <th scope="col" className="text-center px-4 py-3 font-semibold text-muted-foreground">{t('audiobook')}</th>
              <th scope="col" className="text-left px-4 py-3 font-semibold text-muted-foreground">{t('actions')}</th>
            </tr>
          </thead>
          <tbody>
            {(books ?? []).map((book) => (
              <tr key={book.id} className="border-t border-border hover:bg-muted/50">
                <td className="px-4 py-3">
                  <div className="flex items-center gap-3">
                    {book.cover_url && (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={book.cover_url}
                        alt={book.title}
                        className="w-8 h-12 object-cover rounded"
                      />
                    )}
                    <div><span className="font-medium line-clamp-1">{book.title}</span><span id={'edition-'+book.id} className="block text-xs text-muted-foreground">{[book.isbn_13??book.isbn_10,book.language,book.format?editionText('formats.'+book.format):null,book.publisher].filter(Boolean).join(' · ')}</span></div>
                  </div>
                </td>
                <td className="px-4 py-3 text-muted-foreground">{book.author_name}</td>
                <td className="px-4 py-3 text-xs text-muted-foreground">
                  {book.google_books_id ? `GB: ${book.google_books_id.slice(0, 8)}...` : t('manual')}
                </td>
                <td className="px-4 py-3 text-center">
                  {formatter.number(book.affiliate_click_count)}
                </td>
                <td className="px-4 py-3 text-center">
                  <AudiobookToggle bookId={book.id} userId={user.id} title={book.title} initial={book.has_audiobook} />
                </td>
                <td className="px-4 py-3">
                  <Link href={'/book/'+book.id} className="px-2 py-1 text-xs border border-border rounded hover:bg-muted">{t('viewPurchaseLinks')}</Link>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <CatalogPager base="/admin/books" total={catalog.total} cursor={searchParams.cursor} nextCursor={catalog.nextCursor} search={searchParams.search}/>
    </div>
  );
}

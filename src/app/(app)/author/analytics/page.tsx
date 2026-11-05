import {getTranslations,getFormatter} from 'next-intl/server';
import {decodeCursor} from '@/lib/pagination';
import {languageAlternates} from '@/lib/metadata';
import {notFound} from 'next/navigation';
import {getAuthorCatalog,getAuthorAnalytics} from '@/lib/author-catalog';
import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import Link from 'next/link';
import Image from 'next/image';

export const dynamic = 'force-dynamic';
export async function generateMetadata(){const t=await getTranslations('authorAnalytics');return {title:t('title'),alternates:languageAlternates('/author/analytics')};}

export default async function AuthorAnalyticsPage({searchParams}:{searchParams?:{cursor?:string}}) {
  const t=await getTranslations('authorAnalytics'),common=await getTranslations('common'),format=await getFormatter();
  try{decodeCursor(searchParams?.cursor??null);}catch{notFound();}
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  const { data: profile } = await supabase
    .from('users')
    .select('is_verified_author, display_name')
    .eq('id', user.id)
    .single();

  if (!profile?.is_verified_author) redirect('/settings/verify-author');

  const [catalog,analytics]=await Promise.all([getAuthorCatalog(user.id,searchParams?.cursor??null),getAuthorAnalytics(user.id)]);
  if(!analytics)redirect('/settings/verify-author');
  const books=catalog.books,{totalWantToReads,totalCurrentlyReading,totalHaveRead,totalReviews,recentReviews,followerCount}=analytics;

  return (
    <div className="max-w-3xl mx-auto px-4 py-6">
      <div className="flex items-center justify-between mb-6">
        <h1 className="font-display text-2xl font-bold">{t('title')}</h1>
        <Link href="/author/posts/new" className="text-sm text-accent hover:underline">
          {t('newPost')}
        </Link>
      </div>

      {/* Overview stats */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-8">
        {[
          { label: t('books'), value: catalog.total },
          { label: t('want'), value: totalWantToReads },
          { label: t('reading'), value: totalCurrentlyReading },
          { label: t('read'), value: totalHaveRead },
          { label: t('reviews'), value: totalReviews },
          { label: t('followers'), value: followerCount ?? 0 },
        ].map((s) => (
          <div key={s.label} className="rounded-xl border border-border bg-card p-4">
            <p className="text-xs text-muted-foreground mb-1">{s.label}</p>
            <p className="text-2xl font-bold">{format.number(s.value)}</p>
          </div>
        ))}
      </div>

      {/* Books table */}
      {(books ?? []).length > 0 && (
        <section className="mb-8">
          <h2 className="font-semibold text-lg mb-3">{t('yourBooks')}</h2>
          <div className="space-y-3">
            {(books ?? []).map((book) => (
              <Link
                key={book.id}
                href={`/book/${book.id}`}
                className="flex gap-3 items-center p-3 rounded-xl border border-border hover:bg-muted transition-colors"
              >
                <div className="relative w-10 h-14 flex-shrink-0 rounded overflow-hidden bg-muted">
                  {book.cover_url && (
                    <Image src={book.cover_url} alt={book.title} fill className="object-cover" sizes="40px" />
                  )}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="font-semibold text-sm line-clamp-1">{book.title}</p>
                  <div className="flex gap-3 text-xs text-muted-foreground mt-0.5">
                    <span>{t('catalogRating',{rating:book.average_rating===null?'—':format.number(book.average_rating,{maximumFractionDigits:1,minimumFractionDigits:1})})}</span>
                    <span>{t('wantCount',{count:book.want_to_read_count??0})}</span>
                    <span>{t('readCount',{count:book.have_read_count??0})}</span>
                  </div>
                </div>
              </Link>
            ))}
          </div>
        </section>
      )}

      {catalog.nextCursor&&<Link href={'/author/analytics?cursor='+encodeURIComponent(catalog.nextCursor)} className="underline text-sm">{common('loadMore')}</Link>}

      {/* Recent reviews */}
      {recentReviews.length > 0 && (
        <section>
          <h2 className="font-semibold text-lg mb-3">{t('recentReviews')}</h2>
          <div className="space-y-3">
            {recentReviews.map((review) => {
              const reviewer = review.users;
              const bookTitle = review.books?.title ?? t('unknownBook');
              return (
                <div key={review.id} className="p-4 rounded-xl border border-border">
                  <div className="flex items-center justify-between mb-1">
                    <p className="font-medium text-sm">{bookTitle}</p>
                    <span className="text-amber-500 text-sm">{'★'.repeat(review.rating)}</span>
                  </div>
                  {review.content && (
                    <p className="text-sm text-muted-foreground line-clamp-2">{review.content}</p>
                  )}
                  {reviewer && (
                    <Link href={`/user/${reviewer.username}`} className="text-xs text-muted-foreground/60 hover:underline mt-1 inline-block">
                      — {reviewer.display_name}
                    </Link>
                  )}
                </div>
              );
            })}
          </div>
        </section>
      )}
    </div>
  );
}

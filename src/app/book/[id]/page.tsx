import { notFound } from 'next/navigation';
import Image from 'next/image';
import { getBookById, buildAffiliateLinks, getOrCreateBook } from '@/services/books';
import { createClient } from '@/lib/supabase/server';
import { StarRating } from '@/components/books/StarRating';
import { AffiliateLinkButtons } from '@/components/books/AffiliateLinkButtons';
import type { Metadata } from 'next';

interface BookPageProps {
  params: { id: string };
  searchParams: { gid?: string };
}

export async function generateMetadata({ params, searchParams }: BookPageProps): Promise<Metadata> {
  const book = searchParams.gid
    ? await getOrCreateBook(searchParams.gid)
    : await getBookById(params.id);

  if (!book) return { title: 'Book not found' };

  return {
    title: `${book.title} by ${book.author_name}`,
    description: book.description?.slice(0, 155) ?? `${book.title} on Liravo`,
    openGraph: {
      title: book.title,
      description: book.description?.slice(0, 155) ?? '',
      images: book.cover_url ? [{ url: book.cover_url }] : [],
    },
  };
}

export default async function BookPage({ params, searchParams }: BookPageProps) {
  const book = searchParams.gid
    ? await getOrCreateBook(searchParams.gid)
    : await getBookById(params.id);

  if (!book) notFound();

  const country = 'US';
  const affiliateLinks = await buildAffiliateLinks(book, country);

  const supabase = createClient();
  const { data: reviews } = await supabase
    .from('reviews')
    .select('*, users(username, display_name, avatar_url)')
    .eq('book_id', book.id)
    .eq('moderation_status', 'published')
    .order('created_at', { ascending: false })
    .limit(10);

  return (
    <div className="max-w-3xl mx-auto px-4 py-6">
      {/* Book header */}
      <div className="flex gap-6 mb-8">
        <div className="flex-shrink-0">
          {book.cover_url ? (
            <Image
              src={book.cover_url}
              alt={`Cover of ${book.title}`}
              width={120}
              height={180}
              className="rounded-lg shadow-md object-cover"
            />
          ) : (
            <div className="w-[120px] h-[180px] bg-muted rounded-lg flex items-center justify-center">
              <span className="text-muted-foreground text-xs text-center px-2">{book.title}</span>
            </div>
          )}
        </div>

        <div className="flex-1 min-w-0">
          <h1 className="font-display text-2xl font-bold leading-tight mb-1">{book.title}</h1>
          {book.subtitle && <p className="text-muted-foreground mb-2">{book.subtitle}</p>}
          <p className="text-muted-foreground mb-3">by {book.author_name}</p>

          {book.average_rating && (
            <div className="flex items-center gap-2 mb-3">
              <StarRating rating={book.average_rating} readonly size="sm" />
              <span className="text-sm text-muted-foreground">
                {book.average_rating.toFixed(1)} ({book.ratings_count.toLocaleString()} ratings)
              </span>
            </div>
          )}

          <div className="flex flex-wrap gap-2 mb-4">
            {book.genres.slice(0, 4).map((g) => (
              <span key={g} className="px-2 py-0.5 bg-muted text-muted-foreground text-xs rounded-full">
                {g}
              </span>
            ))}
          </div>

          <div className="text-xs text-muted-foreground space-y-0.5">
            {book.publisher && <p>{book.publisher}</p>}
            {book.published_year && <p>{book.published_year}</p>}
            {book.page_count && <p>{book.page_count} pages</p>}
          </div>
        </div>
      </div>

      {/* Affiliate buy links */}
      <AffiliateLinkButtons links={affiliateLinks} bookId={book.id} />

      {/* Description */}
      {book.description && (
        <div className="mt-6">
          <h2 className="font-display text-xl font-bold mb-3">About this book</h2>
          <p className="text-sm leading-relaxed text-muted-foreground line-clamp-6">{book.description}</p>
        </div>
      )}

      {/* Community stats */}
      <div className="mt-6 grid grid-cols-3 gap-4 text-center">
        <div className="bg-muted rounded-lg p-3">
          <p className="text-lg font-bold">{book.currently_reading_count}</p>
          <p className="text-xs text-muted-foreground">Reading now</p>
        </div>
        <div className="bg-muted rounded-lg p-3">
          <p className="text-lg font-bold">{book.want_to_read_count}</p>
          <p className="text-xs text-muted-foreground">Want to read</p>
        </div>
        <div className="bg-muted rounded-lg p-3">
          <p className="text-lg font-bold">{book.have_read_count}</p>
          <p className="text-xs text-muted-foreground">Have read</p>
        </div>
      </div>

      {/* Reviews section */}
      {reviews && reviews.length > 0 && (
        <div className="mt-8">
          <h2 className="font-display text-xl font-bold mb-4">Community Reviews</h2>
          <div className="space-y-4">
            {reviews.map((review) => (
              <div key={review.id} className="border border-border rounded-lg p-4">
                <div className="flex items-center gap-2 mb-2">
                  <StarRating rating={review.rating} readonly size="sm" />
                  <span className="text-sm font-medium">
                    {(review.users as { display_name: string } | null)?.display_name ?? 'Reader'}
                  </span>
                </div>
                {review.content && (
                  <p className="text-sm text-muted-foreground">{review.content}</p>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* JSON-LD structured data */}
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: JSON.stringify({
            '@context': 'https://schema.org',
            '@type': 'Book',
            name: book.title,
            author: { '@type': 'Person', name: book.author_name },
            publisher: book.publisher,
            datePublished: book.published_year,
            numberOfPages: book.page_count,
            isbn: book.isbn_13 ?? book.isbn_10,
            aggregateRating: book.average_rating
              ? {
                  '@type': 'AggregateRating',
                  ratingValue: book.average_rating,
                  ratingCount: book.ratings_count,
                }
              : undefined,
          }),
        }}
      />
    </div>
  );
}

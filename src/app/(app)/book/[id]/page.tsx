import { createClient } from '@/lib/supabase/server';
import { redirect, notFound } from 'next/navigation';
import Image from 'next/image';
import Link from 'next/link';
import { Star, BookOpen, Share2 } from 'lucide-react';
import { ReviewForm } from '@/components/books/ReviewForm';
import { ReactionButtons } from '@/components/books/ReactionButtons';

interface BookPageProps {
  params: { id: string };
}

function StarDisplay({ rating }: { rating: number }) {
  return (
    <div className="flex gap-0.5">
      {[1, 2, 3, 4, 5].map((s) => (
        <Star
          key={s}
          size={14}
          className={
            s <= rating
              ? 'fill-amber-400 stroke-amber-400'
              : 'stroke-muted-foreground/40'
          }
        />
      ))}
    </div>
  );
}

export default async function BookPage({ params }: BookPageProps) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  const { data: book, error } = await supabase
    .from('books')
    .select('*')
    .eq('id', params.id)
    .single();

  if (error || !book) notFound();

  // Check if user already wants to read this book
  const { data: wantShelf } = await supabase
    .from('shelves')
    .select('id')
    .eq('user_id', user.id)
    .eq('default_type', 'want_to_read')
    .single();

  let initialWantToRead = false;
  if (wantShelf) {
    const { data: wantEntry } = await supabase
      .from('shelf_books')
      .select('id')
      .eq('book_id', params.id)
      .eq('shelf_id', wantShelf.id)
      .eq('user_id', user.id)
      .maybeSingle();
    initialWantToRead = !!wantEntry;
  }

  // Fetch reviews for this book
  const { data: reviews } = await supabase
    .from('reviews')
    .select(`
      id, rating, content, review_type, mood_tags, has_spoilers,
      likes_count, created_at,
      users:user_id (display_name, avatar_url, username)
    `)
    .eq('book_id', params.id)
    .eq('moderation_status', 'published')
    .eq('is_hidden', false)
    .order('created_at', { ascending: false })
    .limit(20);

  return (
    <div className="max-w-2xl mx-auto px-4 py-6">
      {/* Book header */}
      <div className="flex gap-5 mb-6">
        <div className="shrink-0">
          {book.cover_url ? (
            <Image
              src={book.cover_url}
              alt={book.title}
              width={120}
              height={180}
              className="w-28 rounded-lg shadow-md object-cover"
            />
          ) : (
            <div className="w-28 h-[168px] bg-muted rounded-lg flex items-center justify-center">
              <BookOpen className="w-8 h-8 text-muted-foreground/40" />
            </div>
          )}
        </div>

        <div className="flex-1 min-w-0">
          <h1 className="text-xl font-display font-bold leading-tight">{book.title}</h1>
          {book.subtitle && (
            <p className="text-muted-foreground text-sm mt-0.5">{book.subtitle}</p>
          )}
          <p className="text-muted-foreground mt-1">
            {book.author_names.join(', ') || book.author_name}
          </p>

          {book.average_rating && (
            <div className="flex items-center gap-2 mt-2">
              <StarDisplay rating={Math.round(book.average_rating)} />
              <span className="text-sm text-muted-foreground">
                {book.average_rating.toFixed(1)} · {book.ratings_count} ratings
              </span>
            </div>
          )}

          <div className="flex flex-wrap gap-2 mt-3">
            {book.page_count && (
              <span className="text-xs text-muted-foreground bg-muted px-2 py-0.5 rounded-full">
                {book.page_count} pages
              </span>
            )}
            {book.published_year && (
              <span className="text-xs text-muted-foreground bg-muted px-2 py-0.5 rounded-full">
                {book.published_year}
              </span>
            )}
            {book.language && book.language !== 'en' && (
              <span className="text-xs text-muted-foreground bg-muted px-2 py-0.5 rounded-full uppercase">
                {book.language}
              </span>
            )}
          </div>
        </div>
      </div>

      {/* Reaction buttons */}
      <div className="flex items-center gap-3 mb-4">
        <ReactionButtons
          bookId={params.id}
          userId={user.id}
          initialWantToRead={initialWantToRead}
        />
        <Link
          href={`/share/book/${params.id}`}
          target="_blank"
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium border border-border text-muted-foreground hover:border-amber-400 hover:text-amber-600 transition-colors"
        >
          <Share2 size={14} />
          Share
        </Link>
      </div>

      {/* Description */}
      {book.description && (
        <div className="mb-6">
          <h2 className="font-semibold mb-2">About this book</h2>
          <p className="text-sm text-muted-foreground leading-relaxed">{book.description}</p>
        </div>
      )}

      {/* Genres */}
      {book.genres.length > 0 && (
        <div className="flex flex-wrap gap-2 mb-6">
          {(book.genres as string[]).map((genre: string) => (
            <span
              key={genre}
              className="text-xs px-2.5 py-1 rounded-full bg-muted text-muted-foreground"
            >
              {genre}
            </span>
          ))}
        </div>
      )}

      {/* Reviews */}
      <section className="mb-8">
        <h2 className="font-display font-bold text-lg mb-4">
          Reviews
          {(reviews?.length ?? 0) > 0 && (
            <span className="text-muted-foreground font-normal text-base ml-2">
              ({reviews?.length})
            </span>
          )}
        </h2>

        {(reviews?.length ?? 0) === 0 ? (
          <p className="text-muted-foreground text-sm">No reviews yet. Be the first!</p>
        ) : (
          <div className="space-y-4">
            {reviews?.map((review) => {
              const reviewer = review.users as unknown as { display_name: string; avatar_url: string | null; username: string } | null;
              return (
                <div key={review.id} className="border border-border rounded-xl p-4">
                  <div className="flex items-start gap-3 mb-2">
                    <Link href={`/@${reviewer?.username}`} className="shrink-0">
                      {reviewer?.avatar_url ? (
                        <Image
                          src={reviewer.avatar_url}
                          alt={reviewer.display_name}
                          width={32}
                          height={32}
                          className="w-8 h-8 rounded-full object-cover"
                        />
                      ) : (
                        <div className="w-8 h-8 rounded-full bg-amber-100 dark:bg-amber-900/30 flex items-center justify-center">
                          <span className="text-xs font-bold text-amber-600">
                            {reviewer?.display_name?.[0]?.toUpperCase() ?? '?'}
                          </span>
                        </div>
                      )}
                    </Link>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <Link
                          href={`/@${reviewer?.username}`}
                          className="font-medium text-sm hover:text-amber-600 transition-colors"
                        >
                          {reviewer?.display_name}
                        </Link>
                        <StarDisplay rating={review.rating} />
                        <span className="text-xs text-muted-foreground/60 capitalize">
                          {review.review_type.replace('_', ' ')}
                        </span>
                      </div>
                    </div>
                  </div>

                  {review.has_spoilers && (
                    <p className="text-xs text-amber-600 font-medium mb-1.5">Contains spoilers</p>
                  )}

                  {review.content && (
                    <p className="text-sm text-muted-foreground leading-relaxed">
                      {review.content}
                    </p>
                  )}

                  {Array.isArray(review.mood_tags) && review.mood_tags.length > 0 && (
                    <div className="flex flex-wrap gap-1.5 mt-2">
                      {review.mood_tags.map((tag: string) => (
                        <span
                          key={tag}
                          className="text-xs px-2 py-0.5 rounded-full bg-amber-50 dark:bg-amber-950/20 text-amber-700 dark:text-amber-300"
                        >
                          {tag}
                        </span>
                      ))}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </section>

      {/* Write a review */}
      <section>
        <h2 className="font-display font-bold text-lg mb-4">Write a review</h2>
        <ReviewForm bookId={params.id} userId={user.id} />
      </section>
    </div>
  );
}

import { clientBook } from '@/lib/catalog-book';
import { getTranslations } from 'next-intl/server';
import { getActivePromotions } from '@/services/promotions';
import { PromotedBookLink } from '@/components/books/PromotedBookLink';
import { HelpfulnessButtons } from '@/components/books/HelpfulnessButtons';
import { languageAlternates } from '@/lib/metadata';
import { singleRelation } from '@/lib/utils';
import { createClient } from '@/lib/supabase/server';
import { createServiceClient } from '@/lib/supabase/server';
import { redirect, notFound } from 'next/navigation';
import Image from 'next/image';
import Link from 'next/link';
import { Star, BookOpen, Share2, BookMarked, MessageSquare } from 'lucide-react';
import { ReviewForm } from '@/components/books/ReviewForm';
import {AddToShelfButton} from '@/components/shelf/AddToShelfButton';
import { ReactionButtons } from '@/components/books/ReactionButtons';
import { AudibleCTA } from '@/components/books/AudibleCTA';
import { AffiliateLinkButtons } from '@/components/books/AffiliateLinkButtons';
import { QuoteForm } from '@/components/books/QuoteForm';
import { buildAffiliateLinks,getAudibleLink } from '@/services/books';
import type { Metadata } from 'next';
import { APP_URL } from '@/constants/config';

export const dynamic = 'force-dynamic';

interface BookPageProps {
  params: { id: string };
}

export async function generateMetadata({ params }: BookPageProps): Promise<Metadata> {
  const supabase = createServiceClient();
  const { data: book } = await supabase
    .from('books')
    .select('title, author_name, description, cover_url, isbn_13, published_year, average_rating')
    .eq('id', params.id)
    .single();

  if (!book) return { title: 'Book not found' };


  return {
    title: `${book.title} by ${book.author_name} — Liravo`,
    description: book.description ? book.description.slice(0, 160) : `Read reviews and discover ${book.title} on Liravo`,
    openGraph: {
      title: `${book.title} by ${book.author_name}`,
      description: book.description?.slice(0, 200) ?? '',
      images: book.cover_url ? [{ url: `${APP_URL}/share/book/${params.id}`, width: 1200, height: 630 }] : [],
      url: `${APP_URL}/book/${params.id}`,
    },
    alternates: languageAlternates(`/book/${params.id}`),
    twitter: { card: 'summary_large_image', title: book.title, images: book.cover_url ? [book.cover_url] : [] },
  };
}

function StarDisplay({ rating }: { rating: number }) {
  return (
    <div className="flex gap-0.5">
      {[1, 2, 3, 4, 5].map((s) => (
        <Star key={s} size={14} className={s <= rating ? 'fill-amber-400 stroke-amber-400' : 'stroke-muted-foreground/40'} />
      ))}
    </div>
  );
}

function RatingBar({ star, count, total }: { star: number; count: number; total: number }) {
  const pct = total > 0 ? Math.round((count / total) * 100) : 0;
  return (
    <div className="flex items-center gap-2 text-xs">
      <span className="w-3 text-right text-muted-foreground">{star}</span>
      <Star size={10} className="fill-amber-400 stroke-amber-400 shrink-0" />
      <div className="flex-1 h-2 bg-muted rounded-full overflow-hidden">
        <div className="h-full bg-amber-400 rounded-full" style={{ width: `${pct}%` }} />
      </div>
      <span className="w-6 text-right text-muted-foreground">{count}</span>
    </div>
  );
}

export default async function BookPage({ params }: BookPageProps) {
  const supabase = createClient();
  const serviceSupabase = createServiceClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  const { data: rawBook, error } = await supabase.from('books').select('*').eq('id', params.id).single();
  if (error || !rawBook) notFound();
  const book=clientBook(rawBook);

  // User country for affiliate links
  const { data: userProfile } = await supabase
    .from('users')
    .select('country, preferred_locale')
    .eq('id', user.id)
    .single();
  const country = userProfile?.country ?? 'US';
  const locale = userProfile?.preferred_locale ?? 'en';

  // Affiliate links
  const affiliateLinks = await buildAffiliateLinks(book, country, locale);
  const promotedBooks=await getActivePromotions('book_page_sidebar',params.id);
  const promotionText=await getTranslations('promotions');

  // Check want-to-read status
  const { data: wantShelf } = await supabase.from('shelves').select('id').eq('user_id', user.id).eq('default_type', 'want_to_read').single();
  let initialWantToRead = false;
  if (wantShelf) {
    const { data: wantEntry } = await supabase.from('shelf_books').select('id').eq('book_id', params.id).eq('shelf_id', wantShelf.id).eq('user_id', user.id).maybeSingle();
    initialWantToRead = !!wantEntry;
  }

  // Fetch reviews with helpfulness counts
  const { data: reviews } = await supabase
    .from('reviews')
    .select('id, user_id, rating, content, review_type, mood_tags, has_spoilers, likes_count, helpful_votes, unhelpful_votes, created_at, users:user_id(display_name, avatar_url, username)')
    .eq('book_id', params.id)
    .eq('moderation_status', 'published')
    .eq('is_hidden', false)
    .order('helpful_votes', { ascending: false })
    .limit(20);

  const { data: helpfulnessVotes } = reviews?.length ? await supabase.from('review_helpfulness_votes')
    .select('review_id,is_helpful').eq('user_id', user.id).in('review_id', reviews.map(review => review.id)) : { data: [] };
  const votesByReview = new Map((helpfulnessVotes ?? []).map(vote => [vote.review_id, vote.is_helpful]));

  // Rating distribution
  const dist: Record<number, number> = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 };
  for (const r of reviews ?? []) dist[r.rating] = (dist[r.rating] ?? 0) + 1;
  const totalRatings = Object.values(dist).reduce((a, b) => a + b, 0);

  // Quotes
  const { data: quotes } = await supabase
    .from('quotes')
    .select('id, content, users:user_id(display_name, username)')
    .eq('book_id', params.id)
    .eq('is_hidden', false)
    .order('created_at', { ascending: false })
    .limit(5);

  // Community notes for this book's reviews (feature-flag gated)
  const { data: communityNotesFlag } = await serviceSupabase
    .from('feature_flags')
    .select('enabled')
    .eq('name', 'community_notes')
    .single();
  const communityNotesEnabled = communityNotesFlag?.enabled === true;
  const { data: communityNotes } = communityNotesEnabled
    ? await serviceSupabase
        .from('community_notes')
        .select('id, note, content_id, created_at')
        .eq('content_type', 'review')
        .in('content_id', (reviews ?? []).map((r) => r.id))
        .eq('status', 'approved')
        .limit(30)
    : { data: [] };
  const notesByReviewId = Object.fromEntries(
    (communityNotes ?? []).map((n: { id: string; note: string; content_id: string; created_at: string }) => [n.content_id, n])
  );

  // Reading lists that include this book
  const { data: listBooks } = await serviceSupabase
    .from('reading_list_books')
    .select('list_id')
    .eq('book_id', params.id)
    .limit(20);
  const listIds = (listBooks ?? []).map((l: { list_id: string }) => l.list_id);
  let readingLists: Array<{ id: string; name: string; user_id: string; users: { display_name: string; username: string } | null }> = [];
  if (listIds.length > 0) {
    const { data } = await serviceSupabase
      .from('reading_lists')
      .select('id, name, user_id, users:user_id(display_name, username)')
      .in('id', listIds)
      .eq('is_public', true)
      .limit(5);
    readingLists = (data ?? []).map(row => ({ ...row, users: singleRelation(row.users) }));
  }

  // Author's Liravo profile
  const { data: authorProfile } = await serviceSupabase
    .from('users')
    .select('username, display_name, avatar_url, is_verified_author')
    .ilike('display_name', book.author_name)
    .eq('is_verified_author', true)
    .maybeSingle();

  // Similar books: check computed table first, then fall back to book.similar_book_ids, then genre
  let similarBooks: Array<{ id: string; title: string; author_name: string; cover_url: string | null }> = [];
  const { data: computedSimilar } = await serviceSupabase
    .from('similar_books_computed')
    .select('similar_book_ids')
    .eq('book_id', params.id)
    .maybeSingle();
  const simIds: string[] = (computedSimilar?.similar_book_ids as string[] | null) ?? (book.similar_book_ids as string[] | null) ?? [];
  if (simIds.length > 0) {
    const { data } = await serviceSupabase.from('books').select('id, title, author_name, cover_url').in('id', simIds.slice(0, 6));
    similarBooks = data ?? [];
  } else {
    // Fallback: same genre, different book
    const genres = book.genres as string[];
    if (genres.length > 0) {
      const { data } = await serviceSupabase
        .from('books')
        .select('id, title, author_name, cover_url')
        .overlaps('genres', genres)
        .neq('id', params.id)
        .order('have_read_count', { ascending: false })
        .limit(6);
      similarBooks = data ?? [];
    }
  }

  // Reply counts per review
  const replyCounts: Record<string, number> = {};
  if ((reviews ?? []).length > 0) {
    const reviewIds = (reviews ?? []).map((r) => r.id);
    const { data: replyData } = await serviceSupabase
      .from('review_replies')
      .select('review_id')
      .in('review_id', reviewIds);
    for (const r of replyData ?? []) {
      replyCounts[r.review_id] = (replyCounts[r.review_id] ?? 0) + 1;
    }
  }

  return (
    <div className="max-w-2xl mx-auto px-4 py-6">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify({
        '@context': 'https://schema.org', '@type': 'Book', name: book.title,
        author: { '@type': 'Person', name: book.author_name }, isbn: book.isbn_13 ?? undefined,
      }).replace(/</g, '\\u003c') }} />
      {/* Book header */}
      <div className="flex gap-5 mb-6">
        <div className="shrink-0">
          {book.cover_url ? (
            <Image src={book.cover_url} alt={book.title} width={120} height={180} className="w-28 rounded-lg shadow-md object-cover" />
          ) : (
            <div className="w-28 h-[168px] bg-muted rounded-lg flex items-center justify-center">
              <BookOpen className="w-8 h-8 text-muted-foreground/40" />
            </div>
          )}
        </div>

        <div className="flex-1 min-w-0">
          <h1 className="text-xl font-display font-bold leading-tight">{book.title}</h1>
          {book.subtitle && <p className="text-muted-foreground text-sm mt-0.5">{book.subtitle}</p>}
          <p className="text-muted-foreground mt-1">
            {(book.author_names as string[]).join(', ') || book.author_name}
          </p>

          {book.average_rating && (
            <div className="flex items-center gap-2 mt-2">
              <StarDisplay rating={Math.round(book.average_rating)} />
              <span className="text-sm text-muted-foreground">{book.average_rating.toFixed(1)} · {book.ratings_count} ratings</span>
            </div>
          )}

          <div className="flex flex-wrap gap-2 mt-2">
            {book.currently_reading_count > 0 && (
              <span className="flex items-center gap-1 text-xs text-muted-foreground bg-muted px-2 py-0.5 rounded-full">
                <BookOpen size={10} /> {book.currently_reading_count} reading
              </span>
            )}
            {book.want_to_read_count > 0 && (
              <span className="flex items-center gap-1 text-xs text-muted-foreground bg-muted px-2 py-0.5 rounded-full">
                <BookMarked size={10} /> {book.want_to_read_count} want to read
              </span>
            )}
          </div>

          <div className="flex flex-wrap gap-1.5 mt-2">
            {book.page_count && <span className="text-xs text-muted-foreground bg-muted px-2 py-0.5 rounded-full">{book.page_count} pages</span>}
            {book.published_year && <span className="text-xs text-muted-foreground bg-muted px-2 py-0.5 rounded-full">{book.published_year}</span>}
          </div>
        </div>
      </div>

      {/* Author Liravo profile */}
      {authorProfile && (
        <Link href={`/user/${authorProfile.username}`} className="flex items-center gap-3 mb-4 p-3 border border-amber-200 dark:border-amber-800 rounded-xl bg-amber-50 dark:bg-amber-950/20 hover:bg-amber-100 dark:hover:bg-amber-950/40 transition-colors">
          {authorProfile.avatar_url ? (
            <Image src={authorProfile.avatar_url} alt={authorProfile.display_name} width={36} height={36} className="w-9 h-9 rounded-full object-cover" />
          ) : (
            <div className="w-9 h-9 rounded-full bg-amber-200 dark:bg-amber-800 flex items-center justify-center text-amber-700 dark:text-amber-200 font-bold text-sm">
              {authorProfile.display_name[0]}
            </div>
          )}
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium">{authorProfile.display_name} is on Liravo</p>
            <p className="text-xs text-muted-foreground">@{authorProfile.username} · Verified Author</p>
          </div>
          <span className="text-xs text-accent font-medium shrink-0">Follow →</span>
        </Link>
      )}

      {/* Action buttons */}
      <div className="flex items-center gap-3 mb-5">
        <ReactionButtons bookId={params.id} userId={user.id} initialWantToRead={initialWantToRead} />
        <AddToShelfButton bookId={params.id} userId={user.id}/>
        <Link href={`/share/book/${params.id}`} target="_blank" className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium border border-border text-muted-foreground hover:border-amber-400 hover:text-amber-600 transition-colors">
          <Share2 size={14} /> Share
        </Link>
      </div>

      {/* Affiliate buy links */}
      {affiliateLinks.length > 0 && (
        <div className="mb-5">
          <AffiliateLinkButtons links={affiliateLinks} bookId={params.id} userId={user.id}/>
        </div>
      )}

      {/* Audible CTA */}
      {book.has_audiobook && (
        <div className="mb-5">
          <AudibleCTA link={getAudibleLink(book,locale,country)!} bookId={params.id} userId={user.id}/>
        </div>
      )}

      {promotedBooks.length>0&&<aside className="mb-5 rounded-xl border border-border p-4 space-y-3" aria-label={promotionText('sponsored')}>
        <h2 className="font-semibold text-sm">{promotionText('sponsored')}</h2>
        {promotedBooks.map(promoted=><PromotedBookLink key={promoted.listing_id} listingId={promoted.listing_id} bookId={promoted.id} className="block text-sm hover:underline"><span className="font-medium">{promoted.title}</span> — {promoted.author_name}</PromotedBookLink>)}
      </aside>}
      {/* Description */}
      {book.description && (
        <div className="mb-6">
          <h2 className="font-semibold mb-2">About this book</h2>
          <p className="text-sm text-muted-foreground leading-relaxed">{book.description}</p>
        </div>
      )}

      {/* Genres */}
      {(book.genres as string[]).length > 0 && (
        <div className="flex flex-wrap gap-2 mb-6">
          {(book.genres as string[]).map((genre: string) => (
            <span key={genre} className="text-xs px-2.5 py-1 rounded-full bg-muted text-muted-foreground">{genre}</span>
          ))}
        </div>
      )}

      {/* Rating distribution */}
      {totalRatings > 0 && (
        <div className="mb-6 p-4 border border-border rounded-xl">
          <h2 className="font-semibold mb-3 text-sm">Rating Breakdown</h2>
          <div className="space-y-1.5">
            {[5, 4, 3, 2, 1].map((s) => (
              <RatingBar key={s} star={s} count={dist[s] ?? 0} total={totalRatings} />
            ))}
          </div>
        </div>
      )}

      {/* Reading lists that include this book */}
      {readingLists.length > 0 && (
        <div className="mb-6">
          <h2 className="font-display font-bold text-lg mb-3">In Reading Lists</h2>
          <div className="space-y-2">
            {readingLists.map((list) => (
              <Link key={list.id} href={`/lists/${list.id}`} className="flex items-center gap-3 p-3 border border-border rounded-xl hover:bg-muted transition-colors">
                <BookMarked size={16} className="text-accent shrink-0" />
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium truncate">{list.name}</p>
                  {list.users && <p className="text-xs text-muted-foreground">by {list.users.display_name}</p>}
                </div>
              </Link>
            ))}
          </div>
        </div>
      )}

      {/* Similar books */}
      {similarBooks.length > 0 && (
        <section className="mb-8">
          <h2 className="font-display font-bold text-lg mb-4">Readers Also Loved</h2>
          <div className="grid grid-cols-3 gap-3">
            {similarBooks.map((b) => (
              <Link key={b.id} href={`/book/${b.id}`} className="group">
                <div className="aspect-[2/3] relative bg-muted rounded-lg overflow-hidden mb-1.5">
                  {b.cover_url ? (
                    <Image src={b.cover_url} alt={b.title} fill sizes="120px" className="object-cover group-hover:scale-105 transition-transform" />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center"><BookOpen size={24} className="text-muted-foreground/40" /></div>
                  )}
                </div>
                <p className="text-xs font-medium leading-tight line-clamp-2">{b.title}</p>
                <p className="text-[10px] text-muted-foreground line-clamp-1">{b.author_name}</p>
              </Link>
            ))}
          </div>
        </section>
      )}

      {/* Community quotes */}
      {(quotes ?? []).length > 0 && (
        <section className="mb-8">
          <h2 className="font-display font-bold text-lg mb-4">Quotes</h2>
          <div className="space-y-3">
            {(quotes ?? []).map((q) => {
              const quoter = q.users as unknown as { display_name: string; username: string } | null;
              return (
                <div key={q.id} className="border-l-4 border-amber-400 pl-4 py-2">
                  <p className="text-sm italic text-muted-foreground leading-relaxed">&ldquo;{q.content}&rdquo;</p>
                  {quoter && (
                    <Link href={`/user/${quoter.username}`} className="text-xs text-muted-foreground/60 mt-1 inline-block hover:underline">
                      — {quoter.display_name}
                    </Link>
                  )}
                </div>
              );
            })}
          </div>
        </section>
      )}

      {/* Reviews */}
      <section className="mb-8">
        <h2 className="font-display font-bold text-lg mb-4">
          Reviews
          {(reviews?.length ?? 0) > 0 && <span className="text-muted-foreground font-normal text-base ml-2">({reviews?.length})</span>}
        </h2>

        {(reviews?.length ?? 0) === 0 ? (
          <p className="text-muted-foreground text-sm">No reviews yet. Be the first!</p>
        ) : (
          <div className="space-y-4">
            {reviews?.map((review) => {
              const reviewer = review.users as unknown as { display_name: string; avatar_url: string | null; username: string } | null;
              const replyCount = replyCounts[review.id] ?? 0;
              return (
                <div key={review.id} className="border border-border rounded-xl p-4">
                  <div className="flex items-start gap-3 mb-2">
                    <Link href={`/user/${reviewer?.username}`} className="shrink-0">
                      {reviewer?.avatar_url ? (
                        <Image src={reviewer.avatar_url} alt={reviewer.display_name} width={32} height={32} className="w-8 h-8 rounded-full object-cover" />
                      ) : (
                        <div className="w-8 h-8 rounded-full bg-amber-100 dark:bg-amber-900/30 flex items-center justify-center">
                          <span className="text-xs font-bold text-amber-600">{reviewer?.display_name?.[0]?.toUpperCase() ?? '?'}</span>
                        </div>
                      )}
                    </Link>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <Link href={`/user/${reviewer?.username}`} className="font-medium text-sm hover:text-amber-600 transition-colors">{reviewer?.display_name}</Link>
                        <StarDisplay rating={review.rating} />
                        <span className="text-xs text-muted-foreground/60 capitalize">{review.review_type?.replace('_', ' ')}</span>
                      </div>
                    </div>
                  </div>

                  {review.has_spoilers && <p className="text-xs text-amber-600 font-medium mb-1.5">Contains spoilers</p>}
                  {review.content && <p className="text-sm text-muted-foreground leading-relaxed mb-2">{review.content}</p>}

                  {Array.isArray(review.mood_tags) && review.mood_tags.length > 0 && (
                    <div className="flex flex-wrap gap-1.5 mb-3">
                      {review.mood_tags.map((tag: string) => (
                        <span key={tag} className="text-xs px-2 py-0.5 rounded-full bg-amber-50 dark:bg-amber-950/20 text-amber-700 dark:text-amber-300">{tag}</span>
                      ))}
                    </div>
                  )}

                  {/* Community note */}
                  {communityNotesEnabled && notesByReviewId[review.id] && (
                    <div className="mt-2 bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800 rounded-lg px-3 py-2">
                      <p className="text-xs font-semibold text-amber-700 dark:text-amber-400 mb-0.5">Community Note</p>
                      <p className="text-xs text-amber-800 dark:text-amber-300">{notesByReviewId[review.id].note}</p>
                    </div>
                  )}

                  {/* Helpfulness + replies */}
                  <div className="flex flex-wrap items-center gap-4 pt-2 border-t border-border/50">
                    {review.user_id!==user.id&&<ReactionButtons bookId={params.id} userId={user.id} reviewId={review.id} initialWantToRead={initialWantToRead}/>}
                    <HelpfulnessButtons bookId={params.id} reviewId={review.id} initialVote={votesByReview.get(review.id) ?? null} helpful={review.helpful_votes ?? 0} unhelpful={review.unhelpful_votes ?? 0} />
                    {replyCount > 0 && (
                      <span className="flex items-center gap-1 text-xs text-muted-foreground ml-auto">
                        <MessageSquare size={12} /> {replyCount} {replyCount === 1 ? 'reply' : 'replies'}
                      </span>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </section>

      {/* Save a quote */}
      <section className="mb-8">
        <h2 className="font-display font-bold text-lg mb-4">Save a Quote</h2>
        <QuoteForm bookId={params.id} userId={user.id}/>
      </section>

      {/* Write a review */}
      <section>
        <h2 className="font-display font-bold text-lg mb-4">Write a Review</h2>
        <ReviewForm bookId={params.id} userId={user.id} />
      </section>
    </div>
  );
}

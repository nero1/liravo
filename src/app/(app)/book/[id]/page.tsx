import {headers} from 'next/headers';
import {getBookAuthors} from '@/lib/author-catalog';
import {getBookReviews,ReviewCursorError} from '@/services/book-reviews';
import {EditionSelector} from '@/components/books/EditionSelector';
import {shareCardPath} from '@/lib/share-card-path';
import { getTranslations,getFormatter,getLocale } from 'next-intl/server';
import { getActivePromotions } from '@/services/promotions';
import { PromotedBookLink } from '@/components/books/PromotedBookLink';
import { HelpfulnessButtons } from '@/components/books/HelpfulnessButtons';
import { languageAlternates,jsonForHtml } from '@/lib/metadata';
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
import { getBookById,getEditionIds,getWorkCatalog,buildAffiliateLinks,getAudibleLink } from '@/services/books';
import type { Metadata } from 'next';
import { APP_URL } from '@/constants/config';

export const dynamic = 'force-dynamic';

interface BookPageProps {
  params: Promise<{ id: string }>;
  searchParams?: Promise<{reviewCursor?:string}>;
}

export async function generateMetadata(props: BookPageProps): Promise<Metadata> {
  const params = await props.params;
  const [book,t,shareLocale]=await Promise.all([getBookById(params.id),getTranslations('book'),getLocale()]);
  if(!book)return {title:t('notFound')};


  return {
    title: t('metadataTitle',{title:book.title,author:book.author_name}),
    description: book.description ? book.description.slice(0, 160) : t('metadataDescription',{title:book.title}),
    openGraph: {
      title: t('metadataTitle',{title:book.title,author:book.author_name}),
      description: book.description?.slice(0, 200) ?? '',
      images: [{url:APP_URL+shareCardPath('book',book.id,shareLocale),width:1200,height:630}],
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

function RatingBar({ star, count, total,label }: { star: number; count: number; total: number;label:string }) {
  const pct = total > 0 ? Math.round((count / total) * 100) : 0;
  return (
    <div className="flex items-center gap-2 text-xs">
      <span className="w-3 text-right text-muted-foreground">{star}</span>
      <Star size={10} className="fill-amber-400 stroke-amber-400 shrink-0" />
      <div className="flex-1 h-2 bg-muted rounded-full overflow-hidden">
        <div className="h-full bg-amber-400 rounded-full" style={{ width: `${pct}%` }} />
      </div>
      <span className="w-6 text-right text-muted-foreground">{label}</span>
    </div>
  );
}

export default async function BookPage(props: BookPageProps) {
  const searchParams = (await props.searchParams)??{};
  const params = await props.params;
  const [t,books,common,reviewText,moods,communityText,format,debateText,authText]=await Promise.all([getTranslations('book'),getTranslations('books'),getTranslations('common'),getTranslations('reviewForm'),getTranslations('moods'),getTranslations('communityNotes'),getFormatter(),getTranslations('bookDebates'),getTranslations('auth')]);
  const supabase = (await createClient());
  const serviceSupabase = createServiceClient();
  const { data: { user } } = await supabase.auth.getUser();

  const book=await getBookById(params.id);if(!book)notFound();
  if(book.id!==params.id)redirect('/book/'+book.id);
  const [workCatalog,editionIds]=await Promise.all([getWorkCatalog(book.work_id),getEditionIds(book.id)]);

  // User country for affiliate links
  const { data: userProfile } = user ? await supabase
    .from('users')
    .select('country, preferred_locale')
    .eq('id', user.id)
    .single():{data:null};
  const country = userProfile?.country ?? 'US';
  const locale = userProfile?.preferred_locale ?? 'en',shareLocale=await getLocale();

  // Affiliate links
  const affiliateLinks = await buildAffiliateLinks(book, country, locale);
  const promotedBooks=await getActivePromotions('book_page_sidebar',params.id);
  const promotionText=await getTranslations('promotions');

  // Check want-to-read status
  const { data: wantShelf } = user ? await supabase.from('shelves').select('id').eq('user_id', user.id).eq('default_type', 'want_to_read').single():{data:null};
  let initialWantToRead = false;
  if (user&&wantShelf) {
    const { data: wantEntry } = await supabase.from('shelf_books').select('id').in('book_id',editionIds).eq('shelf_id', wantShelf.id).eq('user_id',user.id).limit(1).maybeSingle();
    initialWantToRead = !!wantEntry;
  }

  let reviewPage;
  try{reviewPage=await getBookReviews(book.id,searchParams?.reviewCursor??null,20);}catch(error){if(error instanceof ReviewCursorError)notFound();throw error;}
  if(!reviewPage)notFound();
  const reviews=reviewPage.reviews;
  const { data: helpfulnessVotes } = user&&reviews?.length ? await supabase.from('review_helpfulness_votes')
    .select('review_id,is_helpful').eq('user_id', user.id).in('review_id', reviews.map(review => review.id)) : { data: [] };
  const votesByReview = new Map((helpfulnessVotes ?? []).map(vote => [vote.review_id, vote.is_helpful]));

  const dist=reviewPage.statistics.distribution,totalRatings=reviewPage.statistics.ratings_count;
  // Quotes
  const { data: quotes } = await supabase
    .from('quotes')
    .select('id, content, users:user_id(display_name, username)')
    .in('book_id',editionIds)
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
        .select('id, note:note_text, content_id, created_at')
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
    .in('book_id',editionIds)
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

  const authorProfiles=await getBookAuthors(book.id);

  const {data:similar,error:similarError}=await serviceSupabase.rpc('similar_book_snapshot',{p_book:book.id});
  if(similarError||!Array.isArray(similar))throw new Error('Similar books unavailable');
  const similarBooks=similar as Array<{id:string;title:string;author_name:string;cover_url:string|null}>;

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
      <script nonce={(await headers()).get('x-nonce')??undefined} type="application/ld+json"  dangerouslySetInnerHTML={{ __html: jsonForHtml({
        '@context': 'https://schema.org', '@type': 'Book', name: book.title,
        author: { '@type': 'Person', name: book.author_name }, isbn: book.isbn_13 ?? undefined,
        ...(totalRatings&&reviewPage.statistics.average_rating!==null?{aggregateRating:{'@type':'AggregateRating',ratingValue:reviewPage.statistics.average_rating,ratingCount:totalRatings,bestRating:5,worstRating:1}}:{}),
      }) }} />
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

          {reviewPage.statistics.average_rating!==null&&<p className="text-sm text-muted-foreground">{t('communityRatings',{count:totalRatings})} · {format.number(reviewPage.statistics.average_rating,{maximumFractionDigits:2})}/5</p>}
          {book.average_rating!==null && (
            <div className="flex items-center gap-2 mt-2">
              <StarDisplay rating={Math.round(book.average_rating)} />
              <span className="text-sm text-muted-foreground">{format.number(book.average_rating,{minimumFractionDigits:1,maximumFractionDigits:1})} · {books('ratings',{count:book.ratings_count})} · {t('catalogRating')}</span>
            </div>
          )}

          <div className="flex flex-wrap gap-2 mt-2">
            {book.currently_reading_count > 0 && (
              <span className="flex items-center gap-1 text-xs text-muted-foreground bg-muted px-2 py-0.5 rounded-full">
                <BookOpen size={10} /> {t('readingCount',{count:book.currently_reading_count})}
              </span>
            )}
            {book.want_to_read_count > 0 && (
              <span className="flex items-center gap-1 text-xs text-muted-foreground bg-muted px-2 py-0.5 rounded-full">
                <BookMarked size={10} /> {t('wantedCount',{count:book.want_to_read_count})}
              </span>
            )}
          </div>

          <div className="flex flex-wrap gap-1.5 mt-2">
            {book.page_count && <span className="text-xs text-muted-foreground bg-muted px-2 py-0.5 rounded-full">{t('pageCount',{count:book.page_count})}</span>}
            {book.published_year && <span className="text-xs text-muted-foreground bg-muted px-2 py-0.5 rounded-full">{book.published_year}</span>}
          </div>
        </div>
      </div>

      {/* Author Liravo profile */}
      {authorProfiles.map(authorProfile=>(
        <Link key={authorProfile.id} href={`/author/${authorProfile.username}`} className="flex items-center gap-3 mb-4 p-3 border border-amber-200 dark:border-amber-800 rounded-xl bg-amber-50 dark:bg-amber-950/20 hover:bg-amber-100 dark:hover:bg-amber-950/40 transition-colors">
          {authorProfile.avatar_url ? (
            <Image src={authorProfile.avatar_url} alt={authorProfile.display_name} width={36} height={36} className="w-9 h-9 rounded-full object-cover" />
          ) : (
            <div className="w-9 h-9 rounded-full bg-amber-200 dark:bg-amber-800 flex items-center justify-center text-amber-700 dark:text-amber-200 font-bold text-sm">
              {authorProfile.display_name[0]}
            </div>
          )}
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium">{t('authorOnLiravo',{author:authorProfile.display_name})}</p>
            <p className="text-xs text-muted-foreground">@{authorProfile.username} · {t('verifiedAuthor')}</p>
          </div>
          <span className="text-xs text-accent font-medium shrink-0">{t('followAuthor')}</span>
        </Link>
      ))}

      {/* Action buttons */}
      <div className="flex items-center gap-3 mb-5">
        {user&&<ReactionButtons bookId={params.id} userId={user.id} initialWantToRead={initialWantToRead} />}
        {user?<AddToShelfButton bookId={params.id} userId={user?.id}/>:<Link href="/login" className="text-sm underline">{authText('signIn')}</Link>}
        <Link href={shareCardPath('book',book.id,shareLocale)} target="_blank" className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium border border-border text-muted-foreground hover:border-amber-400 hover:text-amber-600 transition-colors">
          <Share2 size={14} /> {common('share')}
        </Link>
      </div>

      {/* Affiliate buy links */}
      {affiliateLinks.length > 0 && (
        <div id="buy-links" className="mb-5">
          <AffiliateLinkButtons links={affiliateLinks} bookId={params.id} userId={user?.id}/>
        </div>
      )}

      {/* Audible CTA */}
      {book.has_audiobook && (
        <div className="mb-5">
          <AudibleCTA link={getAudibleLink(book,locale,country)!} bookId={params.id} userId={user?.id}/>
        </div>
      )}

      {promotedBooks.length>0&&<aside className="mb-5 rounded-xl border border-border p-4 space-y-3" aria-label={promotionText('sponsored')}>
        <h2 className="font-semibold text-sm">{promotionText('sponsored')}</h2>
        {promotedBooks.map(promoted=><PromotedBookLink key={promoted.listing_id} listingId={promoted.listing_id} bookId={promoted.id} className="block text-sm hover:underline"><span className="font-medium">{promoted.title}</span> — {promoted.author_name}</PromotedBookLink>)}
      </aside>}
      {/* Description */}
      {book.description && (
        <div className="mb-6">
          <h2 className="font-semibold mb-2">{t('about')}</h2>
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
          <h2 className="font-semibold mb-3 text-sm">{t('ratingDistribution')}</h2>
          <div className="space-y-1.5">
            {([5, 4, 3, 2, 1] as const).map((s) => (
              <RatingBar key={s} star={s} count={dist[s] ?? 0} total={totalRatings} label={format.number(dist[s]??0)}/>
            ))}
          </div>
        </div>
      )}

      {/* Reading lists that include this book */}
      {readingLists.length > 0 && (
        <div className="mb-6">
          <h2 className="font-display font-bold text-lg mb-3">{t('readingLists')}</h2>
          <div className="space-y-2">
            {readingLists.map((list) => (
              <Link key={list.id} href={`/lists/${list.id}`} className="flex items-center gap-3 p-3 border border-border rounded-xl hover:bg-muted transition-colors">
                <BookMarked size={16} className="text-accent shrink-0" />
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium truncate">{list.name}</p>
                  {list.users && <p className="text-xs text-muted-foreground">{books('writtenBy',{author:list.users.display_name})}</p>}
                </div>
              </Link>
            ))}
          </div>
        </div>
      )}

      {/* Similar books */}
      {similarBooks.length > 0 && (
        <section className="mb-8">
          <h2 className="font-display font-bold text-lg mb-4">{t('similarBooks')}</h2>
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
          <h2 className="font-display font-bold text-lg mb-4">{books('quotes')}</h2>
          <div className="space-y-3">
            {(quotes ?? []).map((q) => {
              const quoter = q.users as unknown as { display_name: string; username: string } | null;
              return (
                <div key={q.id} className="border-l-4 border-amber-400 pl-4 py-2">
                  <p className="text-sm italic text-muted-foreground leading-relaxed">“{q.content}”</p>
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

      {user&&<Link href={'/reading-sessions?book_id='+book.id} className="text-sm text-accent underline">{(await getTranslations('readingHistory'))('title')}</Link>}
      {/* Reviews */}
      <section id="reviews" className="mb-8">
        <h2 className="font-display font-bold text-lg mb-4">
          {books('reviews')}
          {totalRatings > 0 && <span className="text-muted-foreground font-normal text-base ml-2">({format.number(totalRatings)})</span>}
        </h2>

        {(reviews?.length ?? 0) === 0 ? (
          <p className="text-muted-foreground text-sm">{t(totalRatings?'noMoreReviews':'noReviews')}</p>
        ) : (
          <div className="space-y-4">
            {reviews?.map((review) => {
              const reviewer = review.user as unknown as { display_name: string; avatar_url: string | null; username: string } | null;
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
                        <span className="text-xs text-muted-foreground/60 capitalize">{reviewText.has('types.'+review.review_type)?reviewText('types.'+review.review_type):''}</span>
                      </div>
                    </div>
                  </div>

                  {review.has_spoilers && <p className="text-xs text-amber-600 font-medium mb-1.5">{t('spoilers')}</p>}
                  {review.content && <p className="text-sm text-muted-foreground leading-relaxed mb-2">{review.content}</p>}

                  {Array.isArray(review.mood_tags) && review.mood_tags.length > 0 && (
                    <div className="flex flex-wrap gap-1.5 mb-3">
                      {review.mood_tags.map((tag: string) => (
                        <span key={tag} className="text-xs px-2 py-0.5 rounded-full bg-amber-50 dark:bg-amber-950/20 text-amber-700 dark:text-amber-300">{moods.has(tag)?moods(tag):tag}</span>
                      ))}
                    </div>
                  )}

                  {/* Community note */}
                  {communityNotesEnabled && notesByReviewId[review.id] && (
                    <div className="mt-2 bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800 rounded-lg px-3 py-2">
                      <p className="text-xs font-semibold text-amber-700 dark:text-amber-400 mb-0.5">{communityText('title')}</p>
                      <p className="text-xs text-amber-800 dark:text-amber-300">{notesByReviewId[review.id].note}</p>
                    </div>
                  )}

                  {/* Helpfulness + replies */}
                  <div className="flex flex-wrap items-center gap-4 pt-2 border-t border-border/50">
                    {user&&review.user_id!==user.id&&<ReactionButtons bookId={review.book_id} userId={user.id} reviewId={review.id} initialWantToRead={initialWantToRead}/>}
                    {user&&<HelpfulnessButtons bookId={review.book_id} reviewId={review.id} initialVote={votesByReview.get(review.id) ?? null} helpful={review.helpful_votes ?? 0} unhelpful={review.unhelpful_votes ?? 0} />}
                    {replyCount > 0 && (
                      <span className="flex items-center gap-1 text-xs text-muted-foreground ml-auto">
                        <MessageSquare size={12} /> {t('replyCount',{count:replyCount})}
                      </span>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </section>

      {(reviewPage.nextCursor||searchParams?.reviewCursor)&&<nav aria-label={t('reviewPages')} className="flex gap-4 mb-8">
        {searchParams?.reviewCursor&&<Link href={`/book/${book.id}#reviews`} className="text-sm text-accent">{t('firstReviews')}</Link>}
        {reviewPage.nextCursor&&<Link href={`/book/${book.id}?reviewCursor=${encodeURIComponent(reviewPage.nextCursor)}#reviews`} className="text-sm text-accent">{common('loadMore')}</Link>}
      </nav>}

      {workCatalog&&<div className="mb-8"><EditionSelector catalog={workCatalog} book={book}/></div>}

      <Link href={'/debates/new?bookId='+book.id} className="block mb-8 text-sm underline">{debateText('create')}</Link>

      {user&&<>
      {/* Save a quote */}
      <section className="mb-8">
        <h2 className="font-display font-bold text-lg mb-4">{books('saveQuote')}</h2>
        <QuoteForm bookId={params.id} userId={user.id}/>
      </section>

      {/* Write a review */}
      <section>
        <h2 className="font-display font-bold text-lg mb-4">{t('writeReview')}</h2>
        <ReviewForm bookId={params.id} userId={user.id} />
      </section>
      </>}
    </div>
  );
}

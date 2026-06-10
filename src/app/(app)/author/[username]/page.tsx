import { createClient } from '@/lib/supabase/server';
import { notFound } from 'next/navigation';
import Image from 'next/image';
import Link from 'next/link';
import type { Metadata } from 'next';
import { FollowButton } from '@/components/profile/FollowButton';
import { AuthorPostCard } from '@/components/author/AuthorPostCard';

export const dynamic = 'force-dynamic';

const APP_URL = process.env.NEXT_PUBLIC_APP_URL ?? 'https://liravo.org';

export async function generateMetadata({
  params,
}: {
  params: { username: string };
}): Promise<Metadata> {
  const supabase = createClient();
  const { data: author } = await supabase
    .from('users')
    .select('display_name, bio, avatar_url')
    .eq('username', params.username)
    .single();

  const name = author?.display_name ?? params.username;
  const description = author?.bio ?? `Discover books by ${name} on Liravo.`;

  return {
    title: `${name} — Author on Liravo`,
    description,
    openGraph: {
      title: `${name} on Liravo`,
      description,
      images: author?.avatar_url ? [{ url: author.avatar_url }] : [],
      url: `${APP_URL}/author/${params.username}`,
      type: 'profile',
    },
    alternates: { canonical: `${APP_URL}/author/${params.username}` },
  };
}

interface AuthorPost {
  id: string;
  title: string;
  body: string;
  type: string;
  book_id: string | null;
  created_at: string;
}

interface Arc {
  id: string;
  book_id: string;
  description: string;
  reader_slots: number;
  close_date: string | null;
  created_at: string;
}

export default async function AuthorProfilePage({
  params,
}: {
  params: { username: string };
}) {
  const supabase = createClient();
  const {
    data: { user: currentUser },
  } = await supabase.auth.getUser();

  const { data: author, error } = await supabase
    .from('users')
    .select(
      'id, username, display_name, bio, avatar_url, banner_url, is_verified_author, user_types, external_links, xp'
    )
    .eq('username', params.username)
    .single();

  if (error || !author) notFound();

  const isAuthorProfile =
    author.is_verified_author || (author.user_types ?? []).includes('author');

  if (!isAuthorProfile) notFound();

  // Fetch author's books
  const { data: authorBooks } = await supabase
    .from('author_books')
    .select('id, book_id, created_at')
    .eq('author_id', author.id)
    .limit(20);

  const authorBookIds: string[] = ((authorBooks ?? []) as Array<{ book_id: string }>).map(
    (ab) => ab.book_id
  );

  let bookDetails: Array<{
    id: string;
    title: string;
    author_name: string;
    cover_url: string | null;
  }> = [];

  if (authorBookIds.length > 0) {
    const { data: bks } = await supabase
      .from('books')
      .select('id, title, author_name, cover_url')
      .in('id', authorBookIds)
      .limit(20);
    bookDetails = bks ?? [];
  }

  // From-the-author posts
  const { data: postsRaw } = await supabase
    .from('author_posts')
    .select('id, title, body, type, book_id, created_at')
    .eq('author_id', author.id)
    .order('created_at', { ascending: false })
    .limit(10);

  const posts: AuthorPost[] = postsRaw ?? [];

  // Q&A section
  const { data: qaRaw } = await supabase
    .from('author_qa')
    .select('id, question, answer, asked_by, created_at, answered_at')
    .eq('author_id', author.id)
    .eq('is_public', true)
    .not('answer', 'is', null)
    .order('answered_at', { ascending: false })
    .limit(5);

  const qaItems = qaRaw ?? [];

  // "Books that inspired me" shelf (reading list with list_type = 'inspired_by')
  const { data: inspiredListRaw } = await supabase
    .from('reading_lists')
    .select('id, title')
    .eq('user_id', author.id)
    .eq('list_type', 'inspired_by')
    .eq('is_public', true)
    .limit(1)
    .single();

  let inspiredBooks: Array<{ id: string; title: string; cover_url: string | null }> = [];
  if (inspiredListRaw) {
    const { data: listBooks } = await supabase
      .from('reading_list_books')
      .select('books:book_id(id, title, cover_url)')
      .eq('list_id', inspiredListRaw.id)
      .order('position')
      .limit(10);
    inspiredBooks = (listBooks ?? [])
      .map((lb) => lb.books as { id: string; title: string; cover_url: string | null } | null)
      .filter(Boolean) as Array<{ id: string; title: string; cover_url: string | null }>;
  }

  // Active ARCs
  const { data: arcsRaw } = await supabase
    .from('arcs')
    .select('id, book_id, description, reader_slots, close_date, created_at')
    .eq('author_id', author.id)
    .eq('is_active', true)
    .limit(5);

  const arcs: Arc[] = arcsRaw ?? [];

  // Follower count
  const { count: followerCount } = await supabase
    .from('follows')
    .select('follower_id', { count: 'exact', head: true })
    .eq('following_id', author.id);

  // Is current user following
  let isFollowing = false;
  if (currentUser) {
    const { data: follow } = await supabase
      .from('follows')
      .select('follower_id')
      .eq('follower_id', currentUser.id)
      .eq('following_id', author.id)
      .single();
    isFollowing = !!follow;
  }

  const jsonLd = {
    '@context': 'https://schema.org',
    '@type': 'Person',
    name: author.display_name,
    url: `${APP_URL}/author/${author.username}`,
    ...(author.avatar_url && { image: author.avatar_url }),
    ...(author.bio && { description: author.bio }),
    sameAs: (author.external_links ?? []) as string[],
  };

  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }} />
    <div className="max-w-2xl mx-auto px-4 py-8 space-y-8">
      {/* Header */}
      <div className="space-y-4">
        {author.banner_url && (
          <div className="relative w-full h-32 rounded-xl overflow-hidden">
            <Image
              src={author.banner_url}
              alt="Banner"
              fill
              className="object-cover"
              sizes="672px"
            />
          </div>
        )}
        <div className="flex items-start gap-4">
          {author.avatar_url ? (
            <Image
              src={author.avatar_url}
              alt={author.display_name}
              width={72}
              height={72}
              className="rounded-full object-cover flex-shrink-0"
            />
          ) : (
            <div className="w-18 h-18 rounded-full bg-accent flex items-center justify-center text-white text-2xl font-bold flex-shrink-0 w-[72px] h-[72px]">
              {author.display_name[0]}
            </div>
          )}
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <h1 className="font-display text-2xl font-bold">{author.display_name}</h1>
              {author.is_verified_author && (
                <span className="text-xs font-medium px-2 py-0.5 rounded-full bg-accent/10 text-accent">
                  Verified Author
                </span>
              )}
            </div>
            <p className="text-sm text-neutral-500 dark:text-neutral-400">
              @{author.username}
            </p>
            <p className="text-sm text-neutral-500 dark:text-neutral-400">
              {followerCount ?? 0} followers
            </p>
          </div>
          <div className="flex items-center gap-2 flex-shrink-0">
            {currentUser && currentUser.id !== author.id && (
              <>
                <FollowButton
                  targetUserId={author.id}
                  currentUserId={currentUser.id}
                  initialFollowing={isFollowing}
                />
                <Link
                  href={`/author/${author.username}/ask`}
                  className="px-3 py-1.5 rounded-lg border border-border text-sm font-medium hover:bg-muted transition-colors"
                >
                  Ask
                </Link>
              </>
            )}
          </div>
        </div>
        {author.bio && (
          <p className="text-sm text-neutral-700 dark:text-neutral-300">{author.bio}</p>
        )}
      </div>

      {/* Books Catalog */}
      {bookDetails.length > 0 && (
        <section>
          <h2 className="font-display text-xl font-bold mb-4">Books</h2>
          <div className="grid grid-cols-4 sm:grid-cols-5 gap-3">
            {bookDetails.map((book) => (
              <Link
                key={book.id}
                href={`/book/${book.id}`}
                className="flex flex-col gap-1 hover:opacity-80 transition-opacity"
              >
                <div className="relative w-full aspect-[2/3] rounded overflow-hidden bg-neutral-200 dark:bg-neutral-700">
                  {book.cover_url ? (
                    <Image
                      src={book.cover_url}
                      alt={book.title}
                      fill
                      className="object-cover"
                      sizes="120px"
                    />
                  ) : (
                    <div className="flex items-center justify-center h-full text-2xl">📚</div>
                  )}
                </div>
                <p className="text-xs font-medium line-clamp-2 leading-tight">{book.title}</p>
              </Link>
            ))}
          </div>
        </section>
      )}

      {/* Active ARCs */}
      {arcs.length > 0 && (
        <section>
          <h2 className="font-display text-xl font-bold mb-4">Advance Reader Copies (ARCs)</h2>
          <div className="space-y-3">
            {arcs.map((arc) => (
              <div
                key={arc.id}
                className="rounded-xl border border-neutral-200 dark:border-neutral-700 bg-white dark:bg-neutral-900 p-4"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="flex-1">
                    <p className="text-sm text-neutral-700 dark:text-neutral-300 mb-2">
                      {arc.description}
                    </p>
                    <div className="flex items-center gap-3 text-xs text-neutral-500">
                      <span>{arc.reader_slots} reader slots</span>
                      {arc.close_date && (
                        <span>Closes {new Date(arc.close_date).toLocaleDateString()}</span>
                      )}
                    </div>
                  </div>
                  {currentUser && currentUser.id !== author.id && (
                    <form
                      action={`/api/author/arcs/${arc.id}/apply`}
                      method="POST"
                    >
                      <button
                        type="submit"
                        className="px-3 py-1.5 rounded-lg bg-accent text-white text-xs font-semibold hover:opacity-90 transition-opacity flex-shrink-0"
                      >
                        Apply
                      </button>
                    </form>
                  )}
                </div>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* From the Author Posts */}
      {posts.length > 0 && (
        <section>
          <h2 className="font-display text-xl font-bold mb-4">From the Author</h2>
          <div className="space-y-4">
            {posts.map((post) => (
              <AuthorPostCard
                key={post.id}
                post={post}
                author={{
                  username: author.username,
                  display_name: author.display_name,
                  avatar_url: author.avatar_url,
                  is_verified_author: author.is_verified_author,
                }}
              />
            ))}
          </div>
        </section>
      )}

      {/* Books that inspired me */}
      {inspiredBooks.length > 0 && (
        <section>
          <h2 className="font-display text-xl font-bold mb-4">Books That Inspired Me</h2>
          <div className="grid grid-cols-4 sm:grid-cols-5 gap-3">
            {inspiredBooks.map((book) => (
              <Link
                key={book.id}
                href={`/book/${book.id}`}
                className="flex flex-col gap-1 hover:opacity-80 transition-opacity"
              >
                <div className="relative w-full aspect-[2/3] rounded overflow-hidden bg-neutral-200 dark:bg-neutral-700">
                  {book.cover_url ? (
                    <Image
                      src={book.cover_url}
                      alt={book.title}
                      fill
                      className="object-cover"
                      sizes="120px"
                    />
                  ) : (
                    <div className="flex items-center justify-center h-full text-2xl">📚</div>
                  )}
                </div>
                <p className="text-xs font-medium line-clamp-2 leading-tight">{book.title}</p>
              </Link>
            ))}
          </div>
          {inspiredListRaw && (
            <Link
              href={`/lists/${inspiredListRaw.id}`}
              className="mt-2 inline-block text-xs text-accent hover:underline"
            >
              View full list →
            </Link>
          )}
        </section>
      )}

      {/* Q&A */}
      {(qaItems as Array<{
        id: string;
        question: string;
        answer: string | null;
        answered_at: string | null;
      }>).length > 0 && (
        <section>
          <div className="flex items-center justify-between mb-4">
            <h2 className="font-display text-xl font-bold">Q&amp;A</h2>
            {currentUser && currentUser.id !== author.id && (
              <Link
                href={`/author/${author.username}/ask`}
                className="text-sm text-accent hover:underline"
              >
                Ask a question →
              </Link>
            )}
          </div>
          <div className="space-y-4">
            {(qaItems as Array<{
              id: string;
              question: string;
              answer: string | null;
              answered_at: string | null;
            }>).map((item) => (
              <div
                key={item.id}
                className="rounded-xl border border-neutral-200 dark:border-neutral-700 bg-white dark:bg-neutral-900 p-4 space-y-2"
              >
                <p className="text-sm font-semibold">{item.question}</p>
                {item.answer && (
                  <p className="text-sm text-neutral-700 dark:text-neutral-300">{item.answer}</p>
                )}
              </div>
            ))}
          </div>
        </section>
      )}
    </div>
    </>
  );
}

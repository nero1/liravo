import {useTranslations,useFormatter} from 'next-intl';
import Image from 'next/image';
import Link from 'next/link';

interface AuthorPostCardProps {
  post: {
    id: string;
    title: string;
    body: string;
    type: string;
    book_id?: string | null;
    created_at: string;
  };
  author: {
    username: string;
    display_name: string;
    avatar_url?: string | null;
    is_verified_author?: boolean;
  };
  bookCoverUrl?: string | null;
  bookTitle?: string | null;
}

export function AuthorPostCard({ post, author, bookCoverUrl, bookTitle }: AuthorPostCardProps) {
  const t=useTranslations('authorPost'),formatter=useFormatter();
  const date=formatter.dateTime(new Date(post.created_at), {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  });

  return (
    <div className="rounded-xl border border-neutral-200 dark:border-neutral-700 bg-white dark:bg-neutral-900 p-4 space-y-3">
      <div className="flex items-start gap-3">
        {author.avatar_url ? (
          <Image
            src={author.avatar_url}
            alt={author.display_name}
            width={40}
            height={40}
            className="rounded-full object-cover flex-shrink-0"
          />
        ) : (
          <div className="w-10 h-10 rounded-full bg-accent flex items-center justify-center text-white font-bold text-sm flex-shrink-0">
            {author.display_name[0]}
          </div>
        )}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1.5 flex-wrap">
            <Link
              href={`/author/${author.username}`}
              className="font-semibold text-sm hover:underline"
            >
              {author.display_name}
            </Link>
            {author.is_verified_author && (
              <span className="text-accent text-xs font-medium px-1.5 py-0.5 rounded-full bg-accent/10">
                {t('verified')}
              </span>
            )}
            <span className="text-xs text-neutral-500 dark:text-neutral-400 px-1.5 py-0.5 rounded-full bg-neutral-100 dark:bg-neutral-800">
              {t('types.'+(['announcement','blog','arc_invite'].includes(post.type)?post.type:'other'))}
            </span>
          </div>
          <p className="text-xs text-neutral-500 dark:text-neutral-400 mt-0.5">{date}</p>
        </div>
      </div>

      <div>
        <h3 className="font-semibold text-base mb-1">{post.title}</h3>
        <p className="text-sm text-neutral-700 dark:text-neutral-300 line-clamp-4">{post.body}</p>
      </div>

      {post.book_id && bookTitle && (
        <div className="flex items-center gap-3 p-2 rounded-lg bg-neutral-50 dark:bg-neutral-800">
          {bookCoverUrl && (
            <div className="relative w-10 h-14 flex-shrink-0">
              <Image
                src={bookCoverUrl}
                alt={bookTitle}
                fill
                className="object-cover rounded"
                sizes="40px"
              />
            </div>
          )}
          <Link
            href={`/book/${post.book_id}`}
            className="text-sm font-medium hover:underline text-accent"
          >
            {bookTitle}
          </Link>
        </div>
      )}
    </div>
  );
}

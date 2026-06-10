import { ImageResponse } from '@vercel/og';
import { createServiceClient } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';
export const runtime = 'edge';

export async function GET(
  _request: Request,
  { params }: { params: { userId: string; bookId: string } }
) {
  const supabase = createServiceClient();

  const [bookResult, userResult, reviewResult] = await Promise.all([
    supabase
      .from('books')
      .select('title, author_name, cover_url')
      .eq('id', params.bookId)
      .single(),
    supabase
      .from('users')
      .select('display_name, avatar_url')
      .eq('id', params.userId)
      .single(),
    supabase
      .from('reviews')
      .select('rating, content')
      .eq('book_id', params.bookId)
      .eq('user_id', params.userId)
      .order('created_at', { ascending: false })
      .limit(1)
      .single(),
  ]);

  const book = bookResult.data;
  const user = userResult.data;
  const review = reviewResult.data;

  if (!book) {
    return new Response('Not found', { status: 404 });
  }

  const title = book.title ?? 'A great book';
  const authorName = book.author_name ?? '';
  const displayName = user?.display_name ?? 'A reader';
  const rating = review?.rating ?? null;
  const snippet =
    review?.content
      ? review.content.slice(0, 100) + (review.content.length > 100 ? '…' : '')
      : null;
  const stars = rating ? '★'.repeat(rating) + '☆'.repeat(5 - rating) : null;

  return new ImageResponse(
    (
      <div
        style={{
          display: 'flex',
          width: '100%',
          height: '100%',
          background: 'linear-gradient(135deg, #1c1917 0%, #292524 60%, #3f2f1e 100%)',
          fontFamily: 'serif',
        }}
      >
        {/* Book cover */}
        {book.cover_url && (
          <div
            style={{
              display: 'flex',
              width: '240px',
              height: '100%',
              flexShrink: 0,
              position: 'relative',
            }}
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={book.cover_url}
              alt={title}
              style={{
                width: '100%',
                height: '100%',
                objectFit: 'cover',
                opacity: 0.85,
              }}
            />
            {/* Gradient overlay on book cover edge */}
            <div
              style={{
                position: 'absolute',
                top: 0,
                right: 0,
                bottom: 0,
                width: '60px',
                background: 'linear-gradient(to right, transparent, #1c1917)',
              }}
            />
          </div>
        )}

        {/* Content area */}
        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            flex: 1,
            padding: '48px 56px',
            gap: '0',
          }}
        >
          {/* Liravo logo */}
          <div
            style={{
              fontSize: '22px',
              fontWeight: 700,
              color: '#d97706',
              marginBottom: 'auto',
            }}
          >
            Liravo
          </div>

          {/* Main content */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
            <p style={{ fontSize: '18px', color: 'rgba(255,255,255,0.65)', margin: 0 }}>
              {displayName} just finished reading
            </p>

            <h1
              style={{
                fontSize: title.length > 35 ? '34px' : '44px',
                fontWeight: 700,
                color: '#ffffff',
                margin: 0,
                lineHeight: 1.15,
              }}
            >
              {title}
            </h1>

            {authorName && (
              <p style={{ fontSize: '20px', color: 'rgba(255,255,255,0.7)', margin: 0 }}>
                by {authorName}
              </p>
            )}

            {stars && (
              <p style={{ fontSize: '28px', color: '#d97706', margin: '4px 0 0' }}>
                {stars}
              </p>
            )}

            {snippet && (
              <p
                style={{
                  fontSize: '16px',
                  color: 'rgba(255,255,255,0.6)',
                  margin: '8px 0 0',
                  fontStyle: 'italic',
                  lineHeight: 1.5,
                  maxWidth: '580px',
                }}
              >
                "{snippet}"
              </p>
            )}
          </div>

          {/* Footer */}
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '10px',
              marginTop: '32px',
              paddingTop: '16px',
              borderTop: '1px solid rgba(255,255,255,0.15)',
            }}
          >
            {user?.avatar_url && (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={user.avatar_url}
                alt={displayName}
                style={{
                  width: '32px',
                  height: '32px',
                  borderRadius: '50%',
                  objectFit: 'cover',
                }}
              />
            )}
            <p style={{ fontSize: '14px', color: 'rgba(255,255,255,0.5)', margin: 0 }}>
              liravo.org
            </p>
          </div>
        </div>
      </div>
    ),
    { width: 1200, height: 630 }
  );
}

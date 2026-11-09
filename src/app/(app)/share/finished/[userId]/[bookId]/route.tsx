import {ShareRating} from '@/components/books/ShareRating';
import { ImageResponse } from 'next/og';
import {getShareCard,shareCardFailure,SHARE_IMAGE_HEADERS} from '@/lib/share-cards';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function GET(
  request: Request,
  props: { params: Promise<{ userId: string; bookId: string }> }
) {
  const params = await props.params;
  try {
  const {data,t}=await getShareCard(request,'finished',params.bookId,params.userId);
  const {book,reader:user,review}=data;
  const title=book.title,authorName=book.author_name,displayName=user.display_name;
  const rating=review?.rating??null;
  const snippet=review?.content?review.content.slice(0,100)+(review.content.length>100?'…':''):null;

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
              {t('finished',{name:displayName})}
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
                {t('by',{author:authorName})}
              </p>
            )}

            {rating!==null&&<ShareRating rating={rating}/>}

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
                &quot;{snippet}&quot;
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
    { width: 1200, height: 630,headers:SHARE_IMAGE_HEADERS }
  );
  } catch(error) { return shareCardFailure(error); }
}

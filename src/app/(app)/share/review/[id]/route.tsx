import {ShareRating} from '@/components/books/ShareRating';
import { ImageResponse } from '@vercel/og';
import {getShareCard,shareCardFailure,SHARE_IMAGE_HEADERS} from '@/lib/share-cards';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function GET(
  request: Request,
  { params }: { params: { id: string } }
) {
  try {
  const {data:review,t}=await getShareCard(request,'review',params.id);
  const bookTitle=review.book.title,authorName=review.book.author_name,coverUrl=review.book.cover_url,reviewerName=review.reader.display_name;
  const rating=review.rating,content=review.content,truncated=content.length>180?content.slice(0,180)+'…':content;

  return new ImageResponse(
    (
      <div
        style={{
          display: 'flex',
          width: '1200px',
          height: '630px',
          background: 'linear-gradient(135deg, #0f172a 0%, #1e293b 60%, #0f172a 100%)',
          fontFamily: 'sans-serif',
          padding: '48px',
          gap: '40px',
        }}
      >
        {/* Book cover */}
        {coverUrl && (
          <div
            style={{
              display: 'flex',
              flexShrink: 0,
              width: '160px',
              height: '240px',
              borderRadius: '8px',
              overflow: 'hidden',
              boxShadow: '0 20px 40px rgba(0,0,0,0.5)',
              alignSelf: 'center',
            }}
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={coverUrl} alt={bookTitle} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
          </div>
        )}

        {/* Content */}
        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            flex: 1,
            justifyContent: 'space-between',
          }}
        >
          {/* Top: branding */}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ fontSize: '18px', fontWeight: 700, color: '#d97706' }}>Liravo</span>
            <span style={{ fontSize: '14px', color: '#64748b' }}>liravo.org</span>
          </div>

          {/* Middle: book info + review */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
            <div style={{display:'flex',flexDirection:'column'}}>
              <p style={{ fontSize: '24px', fontWeight: 700, color: '#f1f5f9', margin: 0, lineHeight: 1.3 }}>
                {bookTitle}
              </p>
              {authorName && (
                <p style={{ fontSize: '16px', color: '#94a3b8', margin: '4px 0 0', lineHeight: 1 }}>
                  {t('by',{author:authorName})}
                </p>
              )}
            </div>

            {/* Stars */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <ShareRating rating={rating}/>
            </div>

            {/* Review text */}
            {truncated && (
              <p
                style={{
                  fontSize: truncated.length > 120 ? '18px' : '22px',
                  color: '#cbd5e1',
                  lineHeight: 1.6,
                  margin: 0,
                  fontStyle: 'italic',
                }}
              >
                &ldquo;{truncated}&rdquo;
              </p>
            )}
          </div>

          {/* Bottom: reviewer */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <div style={{ width: '28px', height: '2px', background: '#d97706' }} />
            <span style={{ fontSize: '15px', color: '#94a3b8' }}>{t('reviewBy',{name:reviewerName})}</span>
          </div>
        </div>
      </div>
    ),
    { width: 1200, height: 630,headers:SHARE_IMAGE_HEADERS }
  );
  } catch(error) { return shareCardFailure(error); }
}

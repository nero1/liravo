import { ImageResponse } from '@vercel/og';
import {getShareCard,shareCardFailure,SHARE_IMAGE_HEADERS} from '@/lib/share-cards';

export const dynamic = 'force-dynamic';

export const runtime = 'nodejs';

export async function GET(
  request: Request,
  { params }: { params: { id: string } }
) {
  try {
  const {data:book,t}=await getShareCard(request,'book',params.id);
  const title=book.title,author=book.author_name;

  return new ImageResponse(
    (
      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          width: '100%',
          height: '100%',
          background: 'linear-gradient(135deg, #92400e 0%, #d97706 50%, #fbbf24 100%)',
          padding: '48px',
          fontFamily: 'serif',
        }}
      >
        {/* Liravo logo */}
        <div
          style={{
            display: 'flex',
            fontSize: '28px',
            fontWeight: 700,
            color: 'rgba(255,255,255,0.9)',
            letterSpacing: '-0.5px',
            marginBottom: 'auto',
          }}
        >
          Liravo
        </div>

        {/* Main content */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
          <h1
            style={{
              fontSize: title.length > 40 ? '36px' : '48px',
              fontWeight: 700,
              color: '#ffffff',
              margin: 0,
              lineHeight: 1.15,
              maxWidth: '800px',
            }}
          >
            {title}
          </h1>

          {author && (
            <p
              style={{
                fontSize: '22px',
                color: 'rgba(255,255,255,0.8)',
                margin: 0,
                marginTop: '4px',
              }}
            >
              {t('by',{author})}
            </p>
          )}
        </div>

        {/* Bottom tagline */}
        <div
          style={{
            display: 'flex',
            marginTop: '32px',
            paddingTop: '16px',
            borderTop: '1px solid rgba(255,255,255,0.3)',
            color: 'rgba(255,255,255,0.7)',
            fontSize: '16px',
          }}
        >
          {t('discover')}
        </div>
      </div>
    ),
    {
      width: 1200,
      height: 630,
      headers:SHARE_IMAGE_HEADERS,
    }
  );
  } catch(error) { return shareCardFailure(error); }
}

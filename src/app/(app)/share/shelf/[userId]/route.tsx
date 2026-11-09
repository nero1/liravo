import { ImageResponse } from 'next/og';
import {getShareCard,shareCardFailure,SHARE_IMAGE_HEADERS} from '@/lib/share-cards';

export const dynamic = 'force-dynamic';

export const runtime = 'nodejs';

export async function GET(request: Request, props: { params: Promise<{ userId: string }> }) {
  const params = await props.params;
  try {
  const {data,t}=await getShareCard(request,'shelf',params.userId,params.userId);
  const displayName=data.reader.display_name,covers=data.books.map(book=>book.cover_url??'');
  while(covers.length<6)covers.push('');

  return new ImageResponse(
    (
      <div
        style={{
          width: '1200px',
          height: '630px',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          background: 'linear-gradient(135deg, #292524 0%, #1c1917 100%)',
          fontFamily: 'sans-serif',
          padding: '48px',
          gap: '32px',
        }}
      >
        {/* Header */}
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '8px' }}>
          <span style={{ fontSize: '16px', color: '#d97706', fontWeight: 700, letterSpacing: '4px', textTransform: 'uppercase' }}>
            Liravo
          </span>
          <h1 style={{ fontSize: '36px', color: '#fff', fontWeight: 900, margin: 0, lineHeight: 1 }}>
            {t('shelf',{name:displayName})}
          </h1>
        </div>

        {/* Book covers grid (2 rows × 3 cols) */}
        <div style={{ display: 'flex', gap: '16px' }}>
          {covers.slice(0, 6).map((url, i) => (
            <div
              key={i}
              style={{
                width: '140px',
                height: '210px',
                borderRadius: '8px',
                overflow: 'hidden',
                background: '#3c3532',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                flexShrink: 0,
                boxShadow: '0 4px 20px rgba(0,0,0,0.5)',
              }}
            >
              {url ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={url} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
              ) : (
                <span style={{ fontSize: '40px' }}>📚</span>
              )}
            </div>
          ))}
        </div>

        <p style={{ fontSize: '16px', color: '#78716c', margin: 0 }}>
          {t('track')}
        </p>
      </div>
    ),
    { width: 1200, height: 630,headers:SHARE_IMAGE_HEADERS }
  );
  } catch(error) { return shareCardFailure(error); }
}

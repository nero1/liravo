import { ImageResponse } from 'next/og';
import {getPublicReadingYear} from '@/lib/reading-statistics';
import {getLocale,getTranslations} from 'next-intl/server';
import {NextResponse} from 'next/server';
import {z} from 'zod';

export const dynamic = 'force-dynamic';

export const runtime = 'nodejs';

export async function GET(
  request: Request,
  { params }: { params: { userId: string } }
) {
  if(!z.string().uuid().safeParse(params.userId).success)return NextResponse.json({error:'Invalid reader'},{status:400});
  const {searchParams}=new URL(request.url),format=searchParams.get('format'),requestedLocale=searchParams.get('locale');
  if(format&&format!=='stories')return NextResponse.json({error:'Invalid format'},{status:400});
  if(requestedLocale&&!['en','fr','de'].includes(requestedLocale))return NextResponse.json({error:'Invalid locale'},{status:400});
  const locale=requestedLocale??await getLocale(),t=await getTranslations({locale,namespace:'wrapped'}),genres=await getTranslations({locale,namespace:'aiProfiles'}),isStories=format==='stories';
  let summary;try{summary=await getPublicReadingYear(params.userId);}catch{return NextResponse.json({error:'Reading summary unavailable'},{status:503});}
  if(!summary)return NextResponse.json({error:'Reader not found'},{status:404});
  const displayName=summary.displayName,booksRead=summary.booksRead,pagesRead=summary.pagesRead,currentYear=summary.year,genre=summary.topGenres[0],topGenre=genre?(genres.has('genreLabels.'+genre)?genres('genreLabels.'+genre):genre):t('unknownGenre'),number=(value:number)=>new Intl.NumberFormat(locale).format(value);

  if (isStories) {
    // 9:16 Instagram Stories format (1080×1920)
    return new ImageResponse(
      (
        <div
          style={{
            width: '1080px',
            height: '1920px',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            background: 'linear-gradient(180deg, #1c1917 0%, #292524 40%, #44403c 70%, #1c1917 100%)',
            fontFamily: 'sans-serif',
            position: 'relative',
          }}
        >
          {/* Top accent line */}
          <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: '6px', background: 'linear-gradient(90deg, #d97706, #f59e0b, #fbbf24)' }} />

          <div
            style={{
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              gap: '40px',
              padding: '80px 60px',
              textAlign: 'center',
            }}
          >
            <div style={{ fontSize: '22px', color: '#d97706', fontWeight: '700', letterSpacing: '6px', textTransform: 'uppercase' }}>
              {'Liravo · '+t('publicTitle',{year:currentYear})}
            </div>

            <div style={{ fontSize: '64px', color: '#ffffff', fontWeight: '900', lineHeight: 1.1 }}>
              {displayName}
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '48px', marginTop: '32px' }}>
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '8px' }}>
                <div style={{ fontSize: '120px', color: '#f59e0b', fontWeight: '900', lineHeight: 1 }}>{number(booksRead)}</div>
                <div style={{ fontSize: '28px', color: '#a8a29e', letterSpacing: '2px', textTransform: 'uppercase' }}>{t('booksRead')}</div>
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '8px' }}>
                <div style={{ fontSize: '120px', color: '#f59e0b', fontWeight: '900', lineHeight: 1 }}>{number(pagesRead)}</div>
                <div style={{ fontSize: '28px', color: '#a8a29e', letterSpacing: '2px', textTransform: 'uppercase' }}>{t('pagesRead')}</div>
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '8px' }}>
                <div style={{ fontSize: '56px', color: '#f59e0b', fontWeight: '900', lineHeight: 1.2, maxWidth: '800px', textAlign: 'center' }}>{topGenre}</div>
                <div style={{ fontSize: '28px', color: '#a8a29e', letterSpacing: '2px', textTransform: 'uppercase' }}>{t('topGenres')}</div>
              </div>
            </div>

            <div style={{ fontSize: '20px', color: '#78716c', marginTop: '48px' }}>liravo.org</div>
          </div>

          {/* Bottom accent line */}
          <div style={{ position: 'absolute', bottom: 0, left: 0, right: 0, height: '6px', background: 'linear-gradient(90deg, #d97706, #f59e0b, #fbbf24)' }} />
        </div>
      ),
      { width: 1080, height: 1920,headers:{'Cache-Control':'private, no-store'} }
    );
  }

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
          background: 'linear-gradient(135deg, #1c1917 0%, #292524 50%, #44403c 100%)',
          fontFamily: 'sans-serif',
        }}
      >
        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            gap: '20px',
            padding: '60px',
            maxWidth: '900px',
            textAlign: 'center',
          }}
        >
          <div style={{ fontSize: '20px', color: '#d97706', fontWeight: '700', letterSpacing: '4px', textTransform: 'uppercase' }}>
            {'Liravo · '+t('publicTitle',{year:currentYear})}
          </div>
          <div style={{ fontSize: '52px', color: '#ffffff', fontWeight: '900', lineHeight: 1.1 }}>
            {displayName}
          </div>
          <div
            style={{
              display: 'flex',
              gap: '32px',
              marginTop: '16px',
            }}
          >
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '4px' }}>
              <div style={{ fontSize: '60px', color: '#f59e0b', fontWeight: '900' }}>{number(booksRead)}</div>
              <div style={{ fontSize: '16px', color: '#a8a29e' }}>{t('booksRead')}</div>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '4px' }}>
              <div style={{ fontSize: '60px', color: '#f59e0b', fontWeight: '900' }}>{number(pagesRead)}</div>
              <div style={{ fontSize: '16px', color: '#a8a29e' }}>{t('pagesRead')}</div>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '4px' }}>
              <div style={{ fontSize: '30px', color: '#f59e0b', fontWeight: '900', maxWidth: '200px', textAlign: 'center', lineHeight: 1.2 }}>{topGenre}</div>
              <div style={{ fontSize: '16px', color: '#a8a29e' }}>{t('topGenres')}</div>
            </div>
          </div>
          <div style={{ fontSize: '16px', color: '#78716c', marginTop: '16px' }}>liravo.org</div>
        </div>
      </div>
    ),
    { width: 1200, height: 630,headers:{'Cache-Control':'private, no-store'} }
  );
}

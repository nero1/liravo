import { ImageResponse } from 'next/og';
import {getShareCard,shareCardFailure,SHARE_IMAGE_HEADERS} from '@/lib/share-cards';

export const dynamic = 'force-dynamic';

export const runtime = 'nodejs';

export async function GET(request: Request, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  try {
  const {searchParams}=new URL(request.url);
  const {data,t}=await getShareCard(request,'challenge',params.id,searchParams.get('userId'));
  const challengeName=data.title,userName=data.reader?.display_name;
  const bookCount=data.progress?.booksFinished??null,pagesRead=data.progress?.pagesRead??null;

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
          background: 'linear-gradient(135deg, #d97706 0%, #f59e0b 50%, #fbbf24 100%)',
          fontFamily: 'sans-serif',
        }}
      >
        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            gap: '24px',
            padding: '60px',
            background: 'rgba(0,0,0,0.15)',
            borderRadius: '24px',
            maxWidth: '900px',
            textAlign: 'center',
          }}
        >
          <div style={{ fontSize: '72px' }}>🏆</div>
          <div style={{ fontSize: '28px', color: 'rgba(255,255,255,0.9)', fontWeight: '600' }}>
            {userName}
          </div>
          <div style={{ fontSize: '42px', color: '#ffffff', fontWeight: '800', lineHeight: 1.2 }}>
            {t(userName?(data.completed?'challengeCompleted':'challengeProgress'):'readingChallenge')}
          </div>
          <div style={{ fontSize: '48px', color: '#fff7ed', fontWeight: '900', lineHeight: 1.2 }}>
            {challengeName}
          </div>
          <div style={{ fontSize: '38px', color: '#ffffff', fontWeight: '800' }}>
            Liravo
          </div>
          {bookCount!==null && (
            <div style={{ fontSize: '24px', color: 'rgba(255,255,255,0.85)', fontWeight: '500' }}>
              {t('booksRead',{count:bookCount})}
            </div>
          )}
          {pagesRead!==null&&<div style={{fontSize:'24px',color:'rgba(255,255,255,0.85)'}}>{t('pagesRead',{count:pagesRead})}</div>}
          <div style={{ fontSize: '18px', color: 'rgba(255,255,255,0.7)', marginTop: '8px' }}>
            liravo.org
          </div>
        </div>
      </div>
    ),
    { width: 1200, height: 630,headers:SHARE_IMAGE_HEADERS }
  );
  } catch(error) { return shareCardFailure(error); }
}

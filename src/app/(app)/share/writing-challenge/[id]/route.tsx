import { ImageResponse } from 'next/og';
import {getShareCard,shareCardFailure,SHARE_IMAGE_HEADERS} from '@/lib/share-cards';

export const dynamic = 'force-dynamic';

export const runtime = 'nodejs';

export async function GET(request: Request, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  try {
  const {data,t}=await getShareCard(request,'writing-challenge',params.id,new URL(request.url).searchParams.get('userId'));
  const challengeName=data.title,submissionCount=data.submissionCount??0,userName=data.reader?.display_name;

  return new ImageResponse(
    (
      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          width: '1200px',
          height: '630px',
          background: 'linear-gradient(135deg, #fbbf24 0%, #d97706 50%, #92400e 100%)',
          fontFamily: 'sans-serif',
          padding: '60px',
        }}
      >
        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            background: 'rgba(255,255,255,0.15)',
            borderRadius: '24px',
            padding: '48px 64px',
            border: '2px solid rgba(255,255,255,0.3)',
            maxWidth: '960px',
            width: '100%',
          }}
        >
          <div style={{ fontSize: '64px', marginBottom: '16px', display: 'flex' }}>✍️</div>
          <div
            style={{
              fontSize: '28px',
              color: 'rgba(255,255,255,0.9)',
              marginBottom: '12px',
              display: 'flex',
            }}
          >
            {t('writingChallenge')}
          </div>
          <div
            style={{
              fontSize: '48px',
              fontWeight: 'bold',
              color: '#ffffff',
              textAlign: 'center',
              marginBottom: '12px',
              display: 'flex',
            }}
          >
            {challengeName}
          </div>
          <div
            style={{
              fontSize: '28px',
              color: 'rgba(255,255,255,0.9)',
              marginBottom: '32px',
              display: 'flex',
            }}
          >
            {t('writingMessage')}
          </div>

          {submissionCount > 0 && (
            <div
              style={{
                display: 'flex',
                background: 'rgba(255,255,255,0.2)',
                borderRadius: '12px',
                padding: '12px 24px',
                marginBottom: '24px',
              }}
            >
              <span style={{ color: '#ffffff', fontSize: '22px', display: 'flex' }}>
                {t('submissionCount',{count:submissionCount})}
              </span>
            </div>
          )}

          <div style={{ fontSize: '22px', color: 'rgba(255,255,255,0.8)', display: 'flex' }}>
            {userName?'— '+userName:''}
          </div>
        </div>

        <div
          style={{
            position: 'absolute',
            bottom: '32px',
            right: '48px',
            fontSize: '20px',
            color: 'rgba(255,255,255,0.6)',
            display: 'flex',
          }}
        >
          liravo.org
        </div>
      </div>
    ),
    { width: 1200, height: 630,headers:SHARE_IMAGE_HEADERS }
  );
  } catch(error) { return shareCardFailure(error); }
}

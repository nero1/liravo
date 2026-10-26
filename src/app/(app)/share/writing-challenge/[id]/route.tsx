import { ImageResponse } from 'next/og';
import { NextRequest, NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase/server';
import { getTranslations } from 'next-intl/server';
import { z } from 'zod';

export const dynamic = 'force-dynamic';

export const runtime = 'nodejs';

export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  const supabase = createServiceClient();
  const searchParams = new URL(request.url).searchParams;
  const userId = searchParams.get('userId');

  if (!z.string().uuid().safeParse(params.id).success || (userId && !z.string().uuid().safeParse(userId).success)) return NextResponse.json({error:'Invalid share target'},{status:400});
  const t = await getTranslations('writing');
  const { data: challenge, error: challengeError } = await supabase.from('writing_challenges').select('title').eq('id',params.id).maybeSingle();
  if (challengeError) return NextResponse.json({error:'Challenge unavailable'},{status:503});
  if (!challenge) return NextResponse.json({error:'Challenge not found'},{status:404});
  const challengeName = challenge.title;
  let submissionCount = 0;
  let userName = t('writer');
  if (userId) {
    const { data: profile, error: profileError } = await supabase.from('users').select('display_name').eq('id',userId).eq('is_banned',false).maybeSingle();
    if (profileError) return NextResponse.json({error:'Profile unavailable'},{status:503});
    if (!profile) return NextResponse.json({error:'Profile not found'},{status:404});
    userName = profile.display_name || t('writer');
    const {count,error} = await supabase.from('writing_challenge_submissions').select('id',{count:'exact',head:true}).eq('challenge_id',params.id).eq('user_id',userId);
    if (error || count == null) return NextResponse.json({error:'Submissions unavailable'},{status:503});
    submissionCount=count;
  }

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
            {t('shareIntro')}
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
            {t('shareMessage')}
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
            — {userName}
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
    { width: 1200, height: 630 }
  );
}

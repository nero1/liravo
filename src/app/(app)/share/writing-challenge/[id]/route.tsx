import { ImageResponse } from 'next/og';
import { NextRequest } from 'next/server';
import { createServiceClient } from '@/lib/supabase/server';

export const runtime = 'edge';

export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  const supabase = createServiceClient();
  const searchParams = new URL(request.url).searchParams;
  const userId = searchParams.get('userId');

  let challengeName = 'Writing Challenge';
  let submissionCount = 0;
  let userName = 'A Writer';

  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: challenge } = await (supabase as any)
      .from('writing_challenges')
      .select('name')
      .eq('id', params.id)
      .single();

    if (challenge) {
      challengeName = challenge.name;
    }

    if (userId) {
      const { data: profile } = await supabase
        .from('users')
        .select('display_name')
        .eq('id', userId)
        .single();

      if (profile) userName = profile.display_name;

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { count } = await (supabase as any)
        .from('writing_challenge_entries')
        .select('*', { count: 'exact', head: true })
        .eq('challenge_id', params.id)
        .eq('user_id', userId);

      submissionCount = count ?? 0;
    }
  } catch {
    // Use defaults
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
            I completed the
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
            writing challenge on Liravo!
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
                {submissionCount} submission{submissionCount !== 1 ? 's' : ''} submitted
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

import { ImageResponse } from 'next/og';
import { NextRequest } from 'next/server';
import { createServiceClient } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';

export const runtime = 'edge';

export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  // Get challenge details
  const supabase = createServiceClient();

  let challengeName = 'Reading Challenge';
  let bookCount = 0;
  let userName = 'A Reader';

  const searchParams = new URL(request.url).searchParams;
  const userId = searchParams.get('userId');

  try {
    const { data: challenge } = await supabase 
      .from('challenges')
      .select('name, goal_books')
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

      if (profile) {
        userName = profile.display_name;
      }

      // Get progress
      const { data: progress } = await supabase 
        .from('challenge_participants')
        .select('joined_at')
        .eq('challenge_id', params.id)
        .eq('user_id', userId)
        .maybeSingle();

      if (progress && challenge?.goal_books) {
        bookCount = challenge.goal_books;
      }
    }
  } catch {
    // Use defaults
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
            I completed the
          </div>
          <div style={{ fontSize: '48px', color: '#fff7ed', fontWeight: '900', lineHeight: 1.2 }}>
            {challengeName}
          </div>
          <div style={{ fontSize: '38px', color: '#ffffff', fontWeight: '800' }}>
            challenge on Liravo!
          </div>
          {bookCount > 0 && (
            <div style={{ fontSize: '24px', color: 'rgba(255,255,255,0.85)', fontWeight: '500' }}>
              {bookCount} books read
            </div>
          )}
          <div style={{ fontSize: '18px', color: 'rgba(255,255,255,0.7)', marginTop: '8px' }}>
            liravo.org
          </div>
        </div>
      </div>
    ),
    { width: 1200, height: 630 }
  );
}

import { ImageResponse } from 'next/og';
import { createServiceClient } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';

export const runtime = 'edge';

export async function GET(
  request: Request,
  { params }: { params: { userId: string } }
) {
  const { searchParams } = new URL(request.url);
  const isStories = searchParams.get('format') === 'stories';
  const supabase = createServiceClient();

  let displayName = 'A Reader';
  let booksRead = 0;
  let topGenre = 'Fiction';
  let maxStreak = 0;
  const currentYear = new Date().getFullYear();

  try {
    const { data: profile } = await supabase
      .from('users')
      .select('display_name, books_read_count, reading_streak, genres')
      .eq('id', params.userId)
      .single();

    if (profile) {
      displayName = profile.display_name;
      maxStreak = profile.reading_streak ?? 0;
      if (profile.genres && profile.genres.length > 0) {
        topGenre = profile.genres[0];
      }
    }

    // Count books finished this year
    const { data: yearShelves } = await supabase
      .from('shelves')
      .select('id')
      .eq('user_id', params.userId)
      .eq('default_type', 'have_read');

    if (yearShelves && yearShelves.length > 0) {
      const { count } = await supabase
        .from('shelf_books')
        .select('*', { count: 'exact', head: true })
        .in('shelf_id', yearShelves.map((s) => s.id))
        .gte('finished_at', `${currentYear}-01-01`)
        .lte('finished_at', `${currentYear}-12-31`);
      booksRead = count ?? 0;
    }
  } catch {
    // Use defaults
  }

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
              Liravo · {currentYear} Wrapped
            </div>

            <div style={{ fontSize: '64px', color: '#ffffff', fontWeight: '900', lineHeight: 1.1 }}>
              {displayName}
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '48px', marginTop: '32px' }}>
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '8px' }}>
                <div style={{ fontSize: '120px', color: '#f59e0b', fontWeight: '900', lineHeight: 1 }}>{booksRead}</div>
                <div style={{ fontSize: '28px', color: '#a8a29e', letterSpacing: '2px', textTransform: 'uppercase' }}>Books Read</div>
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '8px' }}>
                <div style={{ fontSize: '120px', color: '#f59e0b', fontWeight: '900', lineHeight: 1 }}>{maxStreak}</div>
                <div style={{ fontSize: '28px', color: '#a8a29e', letterSpacing: '2px', textTransform: 'uppercase' }}>Day Streak</div>
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '8px' }}>
                <div style={{ fontSize: '56px', color: '#f59e0b', fontWeight: '900', lineHeight: 1.2, maxWidth: '800px', textAlign: 'center' }}>{topGenre}</div>
                <div style={{ fontSize: '28px', color: '#a8a29e', letterSpacing: '2px', textTransform: 'uppercase' }}>Top Genre</div>
              </div>
            </div>

            <div style={{ fontSize: '20px', color: '#78716c', marginTop: '48px' }}>liravo.org</div>
          </div>

          {/* Bottom accent line */}
          <div style={{ position: 'absolute', bottom: 0, left: 0, right: 0, height: '6px', background: 'linear-gradient(90deg, #d97706, #f59e0b, #fbbf24)' }} />
        </div>
      ),
      { width: 1080, height: 1920 }
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
            Liravo · {currentYear} Wrapped
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
              <div style={{ fontSize: '60px', color: '#f59e0b', fontWeight: '900' }}>{booksRead}</div>
              <div style={{ fontSize: '16px', color: '#a8a29e' }}>Books Read</div>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '4px' }}>
              <div style={{ fontSize: '60px', color: '#f59e0b', fontWeight: '900' }}>{maxStreak}</div>
              <div style={{ fontSize: '16px', color: '#a8a29e' }}>Day Streak</div>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '4px' }}>
              <div style={{ fontSize: '30px', color: '#f59e0b', fontWeight: '900', maxWidth: '200px', textAlign: 'center', lineHeight: 1.2 }}>{topGenre}</div>
              <div style={{ fontSize: '16px', color: '#a8a29e' }}>Top Genre</div>
            </div>
          </div>
          <div style={{ fontSize: '16px', color: '#78716c', marginTop: '16px' }}>liravo.org</div>
        </div>
      </div>
    ),
    { width: 1200, height: 630 }
  );
}

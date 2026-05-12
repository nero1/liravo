import { ImageResponse } from '@vercel/og';
import { createClient } from '@/lib/supabase/server';

export const runtime = 'edge';

export async function GET(
  _request: Request,
  { params }: { params: { id: string } }
) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();

  const { data: book } = await supabase
    .from('books')
    .select('title, author_name, cover_url')
    .eq('id', params.id)
    .single();

  const displayName = user
    ? (await supabase.from('users').select('display_name').eq('id', user.id).single()).data?.display_name
    : null;

  const title = book?.title ?? 'A great book';
  const author = book?.author_name ?? '';

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
          {displayName && (
            <p
              style={{
                fontSize: '20px',
                color: 'rgba(255,255,255,0.85)',
                margin: 0,
              }}
            >
              {displayName} finished reading
            </p>
          )}

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
              by {author}
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
          Discover books on liravo.org
        </div>
      </div>
    ),
    {
      width: 1200,
      height: 630,
    }
  );
}

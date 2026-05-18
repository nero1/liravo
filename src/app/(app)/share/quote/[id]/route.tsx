import { ImageResponse } from '@vercel/og';
import { createServiceClient } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';

export const runtime = 'edge';

export async function GET(
  _request: Request,
  { params }: { params: { id: string } }
) {
  const supabase = createServiceClient();

  const { data: quote } = await supabase
    .from('quotes')
    .select(`
      content, page_number,
      books:book_id (title, author_name, cover_url),
      users:user_id (display_name, username)
    `)
    .eq('id', params.id)
    .eq('is_hidden', false)
    .single();

  const book = (quote?.books as unknown) as { title: string; author_name: string; cover_url: string | null } | null;
  const quoter = (quote?.users as unknown) as { display_name: string; username: string } | null;
  const content = quote?.content ?? 'A beautiful quote from a great book.';
  const bookTitle = book?.title ?? 'Unknown Book';
  const authorName = book?.author_name ?? '';
  const sharedBy = quoter?.display_name ?? quoter?.username ?? null;

  const truncated = content.length > 280 ? content.slice(0, 280) + '…' : content;

  return new ImageResponse(
    (
      <div
        style={{
          display: 'flex',
          width: '1200px',
          height: '630px',
          background: 'linear-gradient(135deg, #1c1917 0%, #292524 60%, #3c2a1a 100%)',
          fontFamily: 'serif',
          position: 'relative',
        }}
      >
        {/* Decorative quote mark */}
        <div
          style={{
            position: 'absolute',
            top: '32px',
            left: '48px',
            fontSize: '180px',
            color: 'rgba(217,119,6,0.15)',
            lineHeight: 1,
            fontFamily: 'Georgia, serif',
          }}
        >
          &ldquo;
        </div>

        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            justifyContent: 'space-between',
            padding: '56px 64px',
            width: '100%',
          }}
        >
          {/* Top branding */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <span style={{ fontSize: '20px', fontWeight: 700, color: '#d97706', letterSpacing: '-0.5px', fontFamily: 'sans-serif' }}>
              Liravo
            </span>
          </div>

          {/* Quote content */}
          <div
            style={{
              display: 'flex',
              flexDirection: 'column',
              gap: '12px',
              maxWidth: '900px',
            }}
          >
            <p
              style={{
                fontSize: truncated.length > 150 ? '28px' : '36px',
                color: '#f5f0eb',
                lineHeight: 1.5,
                margin: 0,
                fontStyle: 'italic',
                fontFamily: 'Georgia, serif',
              }}
            >
              &ldquo;{truncated}&rdquo;
            </p>
          </div>

          {/* Attribution */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
              <div
                style={{
                  width: '32px',
                  height: '2px',
                  background: '#d97706',
                }}
              />
              <span style={{ fontSize: '18px', color: '#f59e0b', fontWeight: 600, fontFamily: 'sans-serif' }}>
                {bookTitle}
              </span>
              {authorName && (
                <span style={{ fontSize: '16px', color: '#a8a29e', fontFamily: 'sans-serif' }}>
                  by {authorName}
                </span>
              )}
            </div>
            {sharedBy && (
              <p style={{ fontSize: '14px', color: '#78716c', margin: 0, paddingLeft: '44px', fontFamily: 'sans-serif' }}>
                shared by {sharedBy} · liravo.org
              </p>
            )}
          </div>
        </div>
      </div>
    ),
    { width: 1200, height: 630 }
  );
}

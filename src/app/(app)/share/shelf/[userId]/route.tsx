import { ImageResponse } from '@vercel/og';
import { createServiceClient } from '@/lib/supabase/server';

export const runtime = 'edge';

export async function GET(
  _request: Request,
  { params }: { params: { userId: string } }
) {
  const supabase = createServiceClient();

  let displayName = 'A Reader';
  const covers: string[] = [];

  try {
    const { data: profile } = await supabase
      .from('users')
      .select('display_name')
      .eq('id', params.userId)
      .single();

    if (profile) displayName = profile.display_name;

    // Get 6 most recently added books from Have Read shelf
    const { data: shelves } = await supabase
      .from('shelves')
      .select('id')
      .eq('user_id', params.userId)
      .eq('default_type', 'have_read')
      .limit(1);

    if (shelves && shelves.length > 0) {
      const { data: shelfBooks } = await supabase
        .from('shelf_books')
        .select('book_id')
        .eq('shelf_id', shelves[0].id)
        .order('added_at', { ascending: false })
        .limit(6);

      if (shelfBooks && shelfBooks.length > 0) {
        const bookIds = shelfBooks.map((sb) => sb.book_id);
        const { data: books } = await supabase
          .from('books')
          .select('cover_url')
          .in('id', bookIds);

        for (const b of books ?? []) {
          if (b.cover_url) covers.push(b.cover_url);
        }
      }
    }
  } catch {
    // Use defaults
  }

  // Pad covers to 6 with nulls
  while (covers.length < 6) covers.push('');

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
            {displayName}&apos;s Shelf
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
          Track your reading at liravo.org
        </p>
      </div>
    ),
    { width: 1200, height: 630 }
  );
}

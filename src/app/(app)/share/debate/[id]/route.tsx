import { singleRelation } from '@/lib/utils';
import { ImageResponse } from '@vercel/og';
import { createServiceClient } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

const APP_URL = process.env.NEXT_PUBLIC_APP_URL ?? 'https://liravo.org';

export async function GET(
  _request: Request,
  { params }: { params: { id: string } }
) {
  const supabase = createServiceClient();

  const { data: debate } = await supabase
    .from('debates')
    .select('id, question, yes_count, no_count, books:book_id(title, author_name, cover_url)')
    .eq('id', params.id)
    .single();

  if (!debate) {
    return new Response('Not found', { status: 404 });
  }

  const book = singleRelation(debate.books);
  const total = (debate.yes_count ?? 0) + (debate.no_count ?? 0);
  const yesPct = total > 0 ? Math.round((debate.yes_count / total) * 100) : 50;
  const noPct = 100 - yesPct;

  return new ImageResponse(
    (
      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          width: '100%',
          height: '100%',
          background: 'linear-gradient(135deg, #0f172a 0%, #1e293b 100%)',
          padding: '56px',
          fontFamily: 'sans-serif',
        }}
      >
        {/* Header */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px' }}>
          <span style={{ fontSize: '22px', fontWeight: 700, color: '#d97706' }}>Liravo</span>
          <span style={{ fontSize: '14px', color: 'rgba(255,255,255,0.5)', background: 'rgba(255,255,255,0.08)', padding: '4px 12px', borderRadius: '999px' }}>
            Book Debate
          </span>
        </div>

        {/* Question */}
        <h1
          style={{
            fontSize: debate.question.length > 80 ? '30px' : '40px',
            fontWeight: 700,
            color: '#ffffff',
            margin: 0,
            lineHeight: 1.2,
            flex: 1,
            display: 'flex',
            alignItems: 'center',
          }}
        >
          {debate.question}
        </h1>

        {/* Book attribution */}
        {book && (
          <p style={{ fontSize: '16px', color: 'rgba(255,255,255,0.5)', margin: '16px 0 24px' }}>
            Re: <span style={{ color: 'rgba(255,255,255,0.75)' }}>{book.title}</span>
            {book.author_name ? ` by ${book.author_name}` : ''}
          </p>
        )}

        {/* Vote bar */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
          {/* Bar */}
          <div style={{ display: 'flex', height: '16px', borderRadius: '8px', overflow: 'hidden' }}>
            <div style={{ width: `${yesPct}%`, background: '#16a34a' }} />
            <div style={{ width: `${noPct}%`, background: '#dc2626' }} />
          </div>

          {/* Labels */}
          <div style={{ display: 'flex', justifyContent: 'space-between' }}>
            <span style={{ fontSize: '20px', fontWeight: 700, color: '#4ade80' }}>
              👍 {yesPct}% Agree ({debate.yes_count ?? 0})
            </span>
            <span style={{ fontSize: '20px', fontWeight: 700, color: '#f87171' }}>
              👎 {noPct}% Disagree ({debate.no_count ?? 0})
            </span>
          </div>
        </div>

        {/* Footer */}
        <p style={{ fontSize: '14px', color: 'rgba(255,255,255,0.35)', marginTop: '24px' }}>
          {APP_URL}/debates/{params.id}
        </p>
      </div>
    ),
    { width: 1200, height: 630 }
  );
}

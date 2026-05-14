import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

// challenges and challenge_participants tables not in generated types — using any cast

export async function GET(
  _request: NextRequest,
  { params }: { params: { id: string } }
) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  // Get challenge details
  const { data: challenge } = await supabase 
    .from('challenges')
    .select('id, goal_books, goal_pages, starts_at, ends_at')
    .eq('id', params.id)
    .single();

  if (!challenge) {
    return NextResponse.json({ error: 'Challenge not found' }, { status: 404 });
  }

  // Check if user has joined
  const { data: participant } = await supabase 
    .from('challenge_participants')
    .select('joined_at')
    .eq('challenge_id', params.id)
    .eq('user_id', user.id)
    .maybeSingle();

  if (!participant) {
    return NextResponse.json({ joined: false, progress: null });
  }

  // Calculate progress: count books finished during challenge period
  const { data: shelves } = await supabase
    .from('shelves')
    .select('id')
    .eq('user_id', user.id)
    .eq('default_type', 'have_read');

  let booksFinished = 0;
  let pagesRead = 0;

  if (shelves && shelves.length > 0) {
    const shelfIds = shelves.map((s) => s.id);
    const { data: finishedBooks } = await supabase
      .from('shelf_books')
      .select('finished_at, progress_pages')
      .in('shelf_id', shelfIds)
      .gte('finished_at', challenge.starts_at)
      .lte('finished_at', challenge.ends_at);

    booksFinished = (finishedBooks ?? []).length;
    pagesRead = (finishedBooks ?? []).reduce((sum, b) => sum + (b.progress_pages ?? 0), 0);
  }

  return NextResponse.json({
    joined: true,
    joinedAt: participant.joined_at,
    progress: {
      booksFinished,
      pagesRead,
      goalBooks: challenge.goal_books,
      goalPages: challenge.goal_pages,
      booksPercent: challenge.goal_books
        ? Math.min(100, Math.round((booksFinished / challenge.goal_books) * 100))
        : null,
      pagesPercent: challenge.goal_pages
        ? Math.min(100, Math.round((pagesRead / challenge.goal_pages) * 100))
        : null,
    },
  });
}

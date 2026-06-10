import { createClient } from '@/lib/supabase/server';
import { NextResponse } from 'next/server';
import { z } from 'zod';
import { getCurrentUser } from '@/lib/auth/getCurrentUser';

export const dynamic = 'force-dynamic';

const GoalSchema = z.object({
  target_books: z.number().int().min(1).max(10000),
  year: z.number().int().min(2020).max(2099).optional(),
});

// GET — get current user's reading goal + progress
export async function GET() {
  const supabase = createClient();
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const currentYear = new Date().getFullYear();

  const { data: goal } = await supabase
    .from('reading_goals')
    .select('id, year, target_books, created_at, updated_at')
    .eq('user_id', user.id)
    .eq('year', currentYear)
    .maybeSingle();

  // Count books read this year (have_read shelf entries)
  const startOfYear = `${currentYear}-01-01`;
  const endOfYear = `${currentYear + 1}-01-01`;

  const { count: booksRead } = await supabase
    .from('shelf_books')
    .select('id', { count: 'exact', head: true })
    .eq('user_id', user.id)
    .eq('shelf', 'have_read')
    .gte('created_at', startOfYear)
    .lt('created_at', endOfYear);

  return NextResponse.json({
    goal: goal ?? null,
    progress: {
      books_read: booksRead ?? 0,
      year: currentYear,
      percentage: goal ? Math.min(100, Math.round(((booksRead ?? 0) / goal.target_books) * 100)) : null,
    },
  });
}

// POST/PUT — set or update reading goal
export async function POST(req: Request) {
  const supabase = createClient();
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  let body: unknown;
  try { body = await req.json(); } catch { return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 }); }

  const parsed = GoalSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 422 });

  const year = parsed.data.year ?? new Date().getFullYear();

  const { data, error } = await supabase
    .from('reading_goals')
    .upsert(
      {
        user_id: user.id,
        year,
        target_books: parsed.data.target_books,
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'user_id,year' }
    )
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ goal: data }, { status: 201 });
}

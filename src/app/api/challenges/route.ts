import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

// challenges table not in generated types — using any cast
// Expected columns: id, name, description, type (weekly|monthly), goal_books, goal_pages, starts_at, ends_at, created_at

export async function GET() {
  const supabase = createClient();

  const now = new Date().toISOString();

  const { data: challenges, error } = await (supabase as any) // eslint-disable-line @typescript-eslint/no-explicit-any
    .from('challenges')
    .select('id, name, description, type, goal_books, goal_pages, starts_at, ends_at, created_at')
    .lte('starts_at', now)
    .gte('ends_at', now)
    .order('ends_at', { ascending: true });

  if (error) {
    return NextResponse.json({ challenges: [] });
  }

  return NextResponse.json({ challenges: challenges ?? [] });
}

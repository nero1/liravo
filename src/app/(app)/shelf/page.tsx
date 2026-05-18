import { createClient } from '@/lib/supabase/server';
import { redirect } from 'next/navigation';
import Link from 'next/link';
import { Plus } from 'lucide-react';
import type { Metadata } from 'next';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = { title: 'My Shelf' };

export default async function ShelfPage() {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  const { data: profile } = await supabase
    .from('users')
    .select('annual_reading_goal, books_read_count, display_name')
    .eq('id', user.id)
    .single();

  const { data: shelves } = await supabase
    .from('shelves')
    .select('id, name, slug, is_default, default_type, is_public, description')
    .eq('user_id', user.id)
    .order('is_default', { ascending: false });

  // Get counts for each shelf
  const shelfIds = (shelves ?? []).map((s) => s.id);
  const { data: counts } = shelfIds.length > 0
    ? await supabase
        .from('shelf_books')
        .select('shelf_id')
        .in('shelf_id', shelfIds)
    : { data: [] };

  const countMap: Record<string, number> = {};
  for (const row of counts ?? []) {
    countMap[row.shelf_id] = (countMap[row.shelf_id] ?? 0) + 1;
  }

  const goalProgress = profile?.annual_reading_goal
    ? Math.min(100, Math.round(((profile.books_read_count ?? 0) / profile.annual_reading_goal) * 100))
    : null;

  const defaultShelves = (shelves ?? []).filter((s) => s.is_default);
  const customShelves = (shelves ?? []).filter((s) => !s.is_default);

  const SHELF_ICONS: Record<string, string> = {
    currently_reading: '📖',
    have_read: '✅',
    want_to_read: '🔖',
  };

  return (
    <div className="max-w-2xl mx-auto px-4 py-6">
      <div className="flex items-center justify-between mb-6">
        <h1 className="font-display text-2xl font-bold">My Shelf</h1>
        <Link
          href="/shelf/new"
          className="flex items-center gap-1.5 px-3 py-2 bg-accent text-accent-foreground rounded-lg text-sm font-medium hover:bg-accent/90 transition-colors"
        >
          <Plus size={16} /> New shelf
        </Link>
      </div>

      {/* Annual reading goal */}
      {goalProgress !== null && (
        <div className="mb-6 p-4 border border-border rounded-xl">
          <div className="flex items-center justify-between mb-2">
            <p className="text-sm font-medium">
              {profile?.books_read_count ?? 0} / {profile?.annual_reading_goal} books this year
            </p>
            <span className="text-sm text-muted-foreground">{goalProgress}%</span>
          </div>
          <div className="h-2 bg-muted rounded-full overflow-hidden">
            <div
              className="h-full bg-accent rounded-full transition-all"
              style={{ width: `${goalProgress}%` }}
            />
          </div>
        </div>
      )}

      {/* Default shelves */}
      <div className="space-y-2 mb-6">
        {defaultShelves.map((shelf) => (
          <Link
            key={shelf.id}
            href={`/shelf/${shelf.slug}`}
            className="flex items-center justify-between p-4 border border-border rounded-xl hover:bg-muted transition-colors"
          >
            <div className="flex items-center gap-3">
              <span className="text-xl">{SHELF_ICONS[shelf.default_type ?? ''] ?? '📚'}</span>
              <div>
                <p className="font-medium">{shelf.name}</p>
                <p className="text-xs text-muted-foreground">
                  {countMap[shelf.id] ?? 0} books
                </p>
              </div>
            </div>
            <span className="text-muted-foreground text-xs">{shelf.is_public ? 'Public' : 'Private'}</span>
          </Link>
        ))}
      </div>

      {/* Custom shelves */}
      {customShelves.length > 0 && (
        <>
          <h2 className="font-semibold text-sm text-muted-foreground uppercase tracking-wide mb-3">
            Custom shelves
          </h2>
          <div className="space-y-2">
            {customShelves.map((shelf) => (
              <Link
                key={shelf.id}
                href={`/shelf/${shelf.slug}`}
                className="flex items-center justify-between p-4 border border-border rounded-xl hover:bg-muted transition-colors"
              >
                <div>
                  <p className="font-medium">{shelf.name}</p>
                  {shelf.description && (
                    <p className="text-xs text-muted-foreground truncate max-w-[240px]">{shelf.description}</p>
                  )}
                  <p className="text-xs text-muted-foreground mt-0.5">{countMap[shelf.id] ?? 0} books</p>
                </div>
                <span className="text-muted-foreground text-xs">{shelf.is_public ? 'Public' : 'Private'}</span>
              </Link>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

import { createClient } from '@/lib/supabase/server';
import { redirect } from 'next/navigation';
import type { Metadata } from 'next';

export const metadata: Metadata = { title: 'My Shelf' };

export default async function ShelfPage() {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  const { data: shelves } = await supabase
    .from('shelves')
    .select('*, shelf_books(count)')
    .eq('user_id', user.id)
    .order('is_default', { ascending: false });

  return (
    <div className="max-w-2xl mx-auto px-4 py-6">
      <h1 className="font-display text-2xl font-bold mb-6">My Shelf</h1>
      {shelves && shelves.length > 0 ? (
        <div className="space-y-3">
          {shelves.map((shelf) => (
            <div key={shelf.id} className="border border-border rounded-xl p-4 flex items-center justify-between">
              <div>
                <p className="font-medium">{shelf.name}</p>
                <p className="text-xs text-muted-foreground">
                  {(shelf.shelf_books as { count: number }[])?.[0]?.count ?? 0} books
                </p>
              </div>
              {shelf.is_default && (
                <span className="text-xs text-muted-foreground bg-muted px-2 py-0.5 rounded-full">Default</span>
              )}
            </div>
          ))}
        </div>
      ) : (
        <p className="text-muted-foreground">Your shelves are empty. Search for books to get started!</p>
      )}
    </div>
  );
}

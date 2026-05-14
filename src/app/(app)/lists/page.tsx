import { createClient } from '@/lib/supabase/server';
import Link from 'next/link';
import type { Metadata } from 'next';

export const metadata: Metadata = { title: 'Reading Lists' };

interface ReadingList {
  id: string;
  user_id: string;
  name: string;
  description: string | null;
  is_public: boolean;
  created_at: string;
}

export default async function ListsPage() {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    return (
      <div className="max-w-2xl mx-auto px-4 py-16 text-center">
        <p className="text-neutral-500">Please log in to view your reading lists.</p>
      </div>
    );
  }

  // Fetch own lists
  const { data: ownLists } = await supabase 
    .from('reading_lists')
    .select('id, user_id, name, description, is_public, created_at')
    .eq('user_id', user.id)
    .order('created_at', { ascending: false });

  // Fetch followed lists
  const { data: followRelations } = await supabase 
    .from('reading_list_follows')
    .select('list_id')
    .eq('user_id', user.id);

  const followedIds = ((followRelations ?? []) as { list_id: string }[]).map((r) => r.list_id);
  let followedLists: ReadingList[] = [];
  if (followedIds.length > 0) {
    const { data } = await supabase 
      .from('reading_lists')
      .select('id, user_id, name, description, is_public, created_at')
      .in('id', followedIds);
    followedLists = data ?? [];
  }

  const myLists: ReadingList[] = ownLists ?? [];

  return (
    <div className="max-w-2xl mx-auto px-4 py-6 space-y-8">
      <div className="flex items-center justify-between">
        <h1 className="font-display text-2xl font-bold">Reading Lists</h1>
        <Link
          href="/lists/new"
          className="px-4 py-2 bg-accent text-white rounded-lg text-sm font-medium hover:opacity-90 transition-opacity"
        >
          + New List
        </Link>
      </div>

      {/* My Lists */}
      <section>
        <h2 className="font-semibold text-lg mb-3">My Lists</h2>
        {myLists.length === 0 ? (
          <div className="text-center py-8 border border-dashed border-neutral-300 dark:border-neutral-700 rounded-lg">
            <p className="text-neutral-500 mb-3">No lists yet.</p>
            <Link href="/lists/new" className="text-accent hover:underline text-sm">
              Create your first reading list
            </Link>
          </div>
        ) : (
          <div className="space-y-3">
            {myLists.map((list) => (
              <Link
                key={list.id}
                href={`/lists/${list.id}`}
                className="block p-4 border border-neutral-200 dark:border-neutral-700 rounded-lg hover:bg-neutral-50 dark:hover:bg-neutral-800 transition-colors"
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="flex-1 min-w-0">
                    <p className="font-semibold">{list.name}</p>
                    {list.description && (
                      <p className="text-sm text-neutral-500 mt-1 line-clamp-2">{list.description}</p>
                    )}
                  </div>
                  <span className={`text-xs px-2 py-1 rounded-full flex-shrink-0 ${list.is_public ? 'bg-green-100 text-green-700 dark:bg-green-900 dark:text-green-300' : 'bg-neutral-100 text-neutral-600 dark:bg-neutral-800 dark:text-neutral-400'}`}>
                    {list.is_public ? 'Public' : 'Private'}
                  </span>
                </div>
              </Link>
            ))}
          </div>
        )}
      </section>

      {/* Followed Lists */}
      {followedLists.length > 0 && (
        <section>
          <h2 className="font-semibold text-lg mb-3">Lists You Follow</h2>
          <div className="space-y-3">
            {followedLists.map((list) => (
              <Link
                key={list.id}
                href={`/lists/${list.id}`}
                className="block p-4 border border-neutral-200 dark:border-neutral-700 rounded-lg hover:bg-neutral-50 dark:hover:bg-neutral-800 transition-colors"
              >
                <p className="font-semibold">{list.name}</p>
                {list.description && (
                  <p className="text-sm text-neutral-500 mt-1 line-clamp-2">{list.description}</p>
                )}
              </Link>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}

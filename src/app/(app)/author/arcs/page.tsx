import { createClient } from '@/lib/supabase/server';
import { redirect } from 'next/navigation';
import Link from 'next/link';
import type { Metadata } from 'next';

export const metadata: Metadata = { title: 'My ARCs' };

export default async function AuthorArcsPage() {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) redirect('/auth/login');

  const { data: profile } = await supabase
    .from('users')
    .select('is_verified_author, user_types, display_name')
    .eq('id', user.id)
    .single();

  const isAuthor =
    profile?.is_verified_author ||
    (profile?.user_types ?? []).includes('author');

  if (!isAuthor) {
    return (
      <div className="max-w-xl mx-auto px-4 py-10 text-center">
        <h1 className="font-display text-2xl font-bold mb-4">Author Access Required</h1>
        <p className="text-neutral-600 dark:text-neutral-400 mb-6">
          You need to be a verified author to manage ARCs.
        </p>
        <Link
          href="/settings/verify-author"
          className="px-4 py-2 rounded-lg bg-accent text-white font-medium hover:opacity-90"
        >
          Apply for Verification
        </Link>
      </div>
    );
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: arcs } = await (supabase as any)
    .from('arcs')
    .select('id, book_id, description, reader_slots, close_date, is_active, created_at')
    .eq('author_id', user.id)
    .order('created_at', { ascending: false });

  const arcList = (arcs ?? []) as Array<{
    id: string;
    book_id: string;
    description: string;
    reader_slots: number;
    close_date: string | null;
    is_active: boolean;
    created_at: string;
  }>;

  return (
    <div className="max-w-2xl mx-auto px-4 py-8">
      <div className="flex items-center justify-between mb-6">
        <h1 className="font-display text-2xl font-bold">My ARCs</h1>
        <Link
          href="/author/arcs/new"
          className="px-4 py-2 rounded-lg bg-accent text-white text-sm font-semibold hover:opacity-90"
        >
          + New ARC
        </Link>
      </div>

      {arcList.length === 0 ? (
        <div className="text-center py-12">
          <p className="text-neutral-500 dark:text-neutral-400 mb-4">
            You have not created any ARCs yet.
          </p>
          <Link
            href="/author/arcs/new"
            className="px-4 py-2 rounded-lg bg-accent text-white font-medium hover:opacity-90"
          >
            Create Your First ARC
          </Link>
        </div>
      ) : (
        <div className="space-y-4">
          {arcList.map((arc) => (
            <div
              key={arc.id}
              className="rounded-xl border border-neutral-200 dark:border-neutral-700 bg-white dark:bg-neutral-900 p-4"
            >
              <div className="flex items-start justify-between gap-3">
                <div>
                  <div className="flex items-center gap-2 mb-1">
                    <span
                      className={`text-xs font-medium px-2 py-0.5 rounded-full ${
                        arc.is_active
                          ? 'bg-green-100 text-green-700 dark:bg-green-900 dark:text-green-300'
                          : 'bg-neutral-100 text-neutral-500 dark:bg-neutral-800'
                      }`}
                    >
                      {arc.is_active ? 'Active' : 'Closed'}
                    </span>
                    <span className="text-xs text-neutral-500">{arc.reader_slots} reader slots</span>
                  </div>
                  <p className="text-sm text-neutral-700 dark:text-neutral-300 line-clamp-2">
                    {arc.description}
                  </p>
                  {arc.close_date && (
                    <p className="text-xs text-neutral-500 mt-1">
                      Closes {new Date(arc.close_date).toLocaleDateString()}
                    </p>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

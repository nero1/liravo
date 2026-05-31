import { createClient } from '@/lib/supabase/server';
import { notFound } from 'next/navigation';
import type { Metadata } from 'next';
import Link from 'next/link';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = { title: 'Prompt Responses' };

const PAGE_SIZE = 20;

interface PageProps {
  params: { id: string };
  searchParams: { page?: string };
}

export default async function PromptResponsesPage({ params, searchParams }: PageProps) {
  const supabase = createClient();

  const { data: prompt } = await supabase
    .from('writing_prompts')
    .select('*')
    .eq('id', params.id)
    .single();

  if (!prompt) notFound();

  const page = Math.max(1, parseInt(searchParams.page ?? '1', 10));
  const from = (page - 1) * PAGE_SIZE;

  const { data: submissions, count } = await supabase
    .from('prompt_submissions')
    .select('id, content, word_count, created_at, user_id, users:user_id(display_name, username, avatar_url)', { count: 'exact' })
    .eq('prompt_id', params.id)
    .order('created_at', { ascending: false })
    .range(from, from + PAGE_SIZE - 1);

  const totalPages = Math.ceil((count ?? 0) / PAGE_SIZE);

  return (
    <div className="max-w-2xl mx-auto px-4 py-6">
      <div className="mb-6">
        <Link href="/write/prompts" className="text-sm text-muted-foreground hover:text-foreground">
          ← Daily Prompts
        </Link>
        <div className="mt-4 rounded-xl border border-amber-200 dark:border-amber-800 bg-amber-50 dark:bg-amber-950/30 p-5">
          <p className="text-xs text-muted-foreground mb-1">{prompt.date}</p>
          <p className="text-lg font-medium text-amber-900 dark:text-amber-100">{prompt.prompt_text}</p>
        </div>
        <p className="text-sm text-muted-foreground mt-2">
          {count ?? 0} response{(count ?? 0) !== 1 ? 's' : ''}
        </p>
      </div>

      <div className="space-y-4">
        {(submissions ?? []).map((sub) => {
          // Bugfix: relation payload can be array-shaped depending on Supabase join typing; normalize safely.
          const profile = Array.isArray(sub.users) ? sub.users[0] : sub.users;
          return (
          <div key={sub.id} className="rounded-xl border bg-card p-5">
            <div className="flex items-center gap-2 mb-3">
              <div className="w-7 h-7 rounded-full bg-muted flex items-center justify-center text-xs font-bold overflow-hidden">
                {profile?.avatar_url ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={profile.avatar_url} alt={profile.display_name} className="w-full h-full object-cover" />
                ) : (
                  profile?.display_name?.[0]?.toUpperCase() ?? '?'
                )}
              </div>
              <div>
                <Link
                  href={`/user/${profile?.username ?? ''}`}
                  className="text-sm font-medium hover:underline"
                >
                  {profile?.display_name ?? 'Unknown'}
                </Link>
                <span className="text-xs text-muted-foreground ml-2">{sub.word_count} words</span>
              </div>
              <span className="ml-auto text-xs text-muted-foreground">
                {new Date(sub.created_at).toLocaleDateString()}
              </span>
            </div>
            <p className="text-sm leading-relaxed whitespace-pre-wrap">{sub.content}</p>
          </div>
        )})}
      </div>

      {totalPages > 1 && (
        <div className="flex items-center justify-center gap-2 mt-6">
          {page > 1 && (
            <Link
              href={`/write/prompts/${params.id}?page=${page - 1}`}
              className="rounded-lg border px-3 py-1.5 text-sm hover:bg-muted"
            >
              Previous
            </Link>
          )}
          <span className="text-sm text-muted-foreground">
            Page {page} of {totalPages}
          </span>
          {page < totalPages && (
            <Link
              href={`/write/prompts/${params.id}?page=${page + 1}`}
              className="rounded-lg border px-3 py-1.5 text-sm hover:bg-muted"
            >
              Next
            </Link>
          )}
        </div>
      )}
    </div>
  );
}

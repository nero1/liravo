import { createClient } from '@/lib/supabase/server';
import { z } from 'zod';
import { notFound } from 'next/navigation';
import type { Metadata } from 'next';
import Link from 'next/link';
import { getTranslations, getFormatter } from 'next-intl/server';

export const dynamic = 'force-dynamic';

export async function generateMetadata(): Promise<Metadata> { return { title: (await getTranslations('writing'))('responsesTitle') }; }

const PAGE_SIZE = 20;

interface PageProps {
  params: { id: string };
  searchParams: { page?: string };
}

export default async function PromptResponsesPage({ params, searchParams }: PageProps) {
  const t = await getTranslations('writing');
  const formatter = await getFormatter();
  if (!z.string().uuid().safeParse(params.id).success) notFound();
  const supabase = createClient();

  const { data: prompt, error: promptError } = await supabase
    .from('writing_prompts')
    .select('*')
    .eq('id', params.id).eq('is_active',true)
    .maybeSingle();

  if (promptError) throw new Error('Prompt unavailable');
  if (!prompt) notFound();

  const parsedPage=z.coerce.number().int().min(1).max(10000).safeParse(searchParams.page??1);
  if (!parsedPage.success) notFound();
  const page=parsedPage.data;
  const from = (page - 1) * PAGE_SIZE;

  const { data: submissions, count, error: submissionsError } = await supabase
    .from('writing_prompt_submissions')
    .select('id, content, word_count, created_at, user_id, users:user_id(display_name, username, avatar_url)', { count: 'exact' })
    .eq('prompt_id', params.id)
    .order('created_at', { ascending: false }).order('id',{ascending:false})
    .range(from, from + PAGE_SIZE - 1);

  if (submissionsError || count == null) throw new Error('Responses unavailable');
  const totalPages = Math.ceil((count ?? 0) / PAGE_SIZE);

  if (page > Math.max(1,totalPages)) notFound();
  return (
    <div className="max-w-2xl mx-auto px-4 py-6">
      <div className="mb-6">
        <Link href="/write/prompts" className="text-sm text-muted-foreground hover:text-foreground">{t('dailyPrompts')}</Link>
        <div className="mt-4 rounded-xl border border-amber-200 dark:border-amber-800 bg-amber-50 dark:bg-amber-950/30 p-5">
          <p className="text-xs text-muted-foreground mb-1">{prompt.prompt_date ? formatter.dateTime(new Date(prompt.prompt_date),{dateStyle:'medium'}) : ''}</p>
          <p className="text-lg font-medium text-amber-900 dark:text-amber-100">{prompt.prompt_text}</p>
        </div>
        <p className="text-sm text-muted-foreground mt-2">
          {t('responseCount',{count:count??0})}
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
                  {profile?.display_name ?? t('unknown')}
                </Link>
                <span className="text-xs text-muted-foreground ml-2">{t('wordCount',{count:sub.word_count??0})}</span>
              </div>
              <span className="ml-auto text-xs text-muted-foreground">
                {formatter.dateTime(new Date(sub.created_at),{dateStyle:'medium'})}
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
            >{t('previous')}</Link>
          )}
          <span className="text-sm text-muted-foreground">
            {t('pageInfo',{page,total:totalPages})}
          </span>
          {page < totalPages && (
            <Link
              href={`/write/prompts/${params.id}?page=${page + 1}`}
              className="rounded-lg border px-3 py-1.5 text-sm hover:bg-muted"
            >{t('next')}</Link>
          )}
        </div>
      )}
    </div>
  );
}

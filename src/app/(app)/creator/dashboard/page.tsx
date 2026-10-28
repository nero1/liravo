import {getCreatorAnalytics} from '@/lib/creator-analytics';
import {getCurrentUser} from '@/lib/auth/getCurrentUser';
import {getTranslations,getFormatter} from 'next-intl/server';
import { createClient } from '@/lib/supabase/server';
import { redirect } from 'next/navigation';
import Link from 'next/link';
import type { Metadata } from 'next';

export const dynamic = 'force-dynamic';

export async function generateMetadata():Promise<Metadata>{return {title:(await getTranslations('creator'))('dashboard'),robots:{index:false}};}

export default async function CreatorDashboardPage() {
  const t=await getTranslations('creator'),formatter=await getFormatter(),supabase = createClient();
  const user=await getCurrentUser();if(!user)redirect('/login');

  const { data: profile,error:profileError } = await supabase
    .from('users')
    .select('display_name, username, avatar_url, is_creator, user_types')
    .eq('id', user.id)
    .single();

  if(profileError||!profile)return <p role="alert">{t('unavailable')}</p>;
  const isCreator =
    profile?.is_creator || (profile?.user_types ?? []).includes('creator');

  if (!isCreator) {
    return (
      <div className="max-w-xl mx-auto px-4 py-10 text-center">
        <h1 className="font-display text-2xl font-bold mb-4">{t('accessRequired')}</h1>
        <p className="text-neutral-600 dark:text-neutral-400 mb-6">
          {t('accessDescription')}
        </p>
        <Link
          href="/profile/edit"
          className="px-4 py-2 rounded-lg bg-accent text-white font-medium hover:opacity-90"
        >
          {t('settings')}
        </Link>
      </div>
    );
  }

  let analytics,recentReviews;
  try{
    analytics=await getCreatorAnalytics(user.id);
    const {data,error}=await supabase.from('reviews').select('id, book_id, rating, content, created_at').eq('user_id',user.id).order('created_at',{ascending:false}).limit(5);
    if(error)throw error;recentReviews=data??[];
  }catch{return <p role="alert">{t('unavailable')}</p>;}

  return (
    <div className="max-w-2xl mx-auto px-4 py-8 space-y-8">
      <div>
        <h1 className="font-display text-2xl font-bold">{t('dashboard')}</h1>
        <p className="text-neutral-500 dark:text-neutral-400 text-sm mt-1">
          {t('description')}
        </p>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        {[
          { label:t('followers'),value:formatter.number(analytics.follower_count) },
          { label:t('reviews'),value:formatter.number(analytics.review_count) },
          { label:t('conversions'),value:formatter.number(analytics.want_to_read_triggered) },
          ...Object.entries(analytics.tips_received_by_currency).map(([currency,amount])=>({label:t('tips',{currency}),value:formatter.number(amount,{style:'currency',currency})})),
        ].map((stat) => (
          <div
            key={stat.label}
            className="rounded-xl border border-neutral-200 dark:border-neutral-700 bg-white dark:bg-neutral-900 p-4 text-center"
          >
            <p className="text-2xl font-bold text-accent">{stat.value}</p>
            <p className="text-xs text-neutral-500 dark:text-neutral-400 mt-1">{stat.label}</p>
          </div>
        ))}
      </div>

      {/* Quick links */}
      <div className="flex gap-3 flex-wrap">
        <Link
          href="/creator/leaderboard"
          className="px-4 py-2 rounded-lg border border-neutral-200 dark:border-neutral-700 text-sm font-medium hover:bg-accent hover:text-white hover:border-accent transition-colors"
        >
          {t('leaderboard')}
        </Link>
        <Link
          href="/write"
          className="px-4 py-2 rounded-lg border border-neutral-200 dark:border-neutral-700 text-sm font-medium hover:bg-accent hover:text-white hover:border-accent transition-colors"
        >
          {t('writeReview')}
        </Link>
      </div>

      {/* Recent Activity */}
      {(recentReviews ?? []).length > 0 && (
        <section>
          <h2 className="font-display text-lg font-bold mb-3">{t('recentReviews')}</h2>
          <div className="space-y-3">
            {(recentReviews ?? []).map((review) => (
              <div
                key={review.id}
                className="rounded-xl border border-neutral-200 dark:border-neutral-700 bg-white dark:bg-neutral-900 p-4"
              >
                <div className="flex items-center justify-between mb-1">
                  <div className="flex items-center gap-1">
                    {Array.from({ length: 5 }).map((_, i) => (
                      <span
                        key={i}
                        className={`text-sm ${i < review.rating ? 'text-accent' : 'text-neutral-300 dark:text-neutral-600'}`}
                      >
                        ★
                      </span>
                    ))}
                  </div>
                  <span className="text-xs text-neutral-500">
                    {formatter.dateTime(new Date(review.created_at),{dateStyle:'medium'})}
                  </span>
                </div>
                {review.content && (
                  <p className="text-sm text-neutral-700 dark:text-neutral-300 line-clamp-2">
                    {review.content}
                  </p>
                )}
                <Link
                  href={`/book/${review.book_id}`}
                  className="text-xs text-accent hover:underline mt-1 block"
                >
                  {t('viewBook')}
                </Link>
              </div>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}

import { createClient } from '@/lib/supabase/server';
import Link from 'next/link';
import Image from 'next/image';
import { notFound } from 'next/navigation';
import type { Metadata } from 'next';

export const dynamic = 'force-dynamic';

interface Props {
  params: { id: string };
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const supabase = createClient();
  const { data } = await supabase 
    .from('challenges')
    .select('name')
    .eq('id', params.id)
    .single();
  return { title: data?.name ?? 'Challenge' };
}

function daysLeft(endStr: string) {
  const diff = new Date(endStr).getTime() - Date.now();
  return Math.max(0, Math.ceil(diff / (1000 * 60 * 60 * 24)));
}

export default async function ChallengeDetailPage({ params }: Props) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();

  const { data: challenge } = await supabase 
    .from('challenges')
    .select('id, name, description, type, goal_books, goal_pages, starts_at, ends_at')
    .eq('id', params.id)
    .single();

  if (!challenge) notFound();

  // Get participants with user info
  const { data: participants } = await supabase 
    .from('challenge_participants')
    .select('user_id, joined_at')
    .eq('challenge_id', params.id)
    .order('joined_at', { ascending: true })
    .limit(50);

  const participantIds = ((participants ?? []) as { user_id: string }[]).map((p) => p.user_id);
  let participantUsers: Array<{ id: string; display_name: string; username: string; avatar_url: string | null; xp: number }> = [];

  if (participantIds.length > 0) {
    const { data } = await supabase
      .from('users')
      .select('id, display_name, username, avatar_url, xp')
      .in('id', participantIds)
      .order('xp', { ascending: false });
    participantUsers = data ?? [];
  }

  const isJoined = user ? participantIds.includes(user.id) : false;
  const left = daysLeft(challenge.ends_at);

  return (
    <div className="max-w-2xl mx-auto px-4 py-6 space-y-6">
      <Link href="/challenges" className="text-sm text-neutral-500 hover:underline">
        ← Back to Challenges
      </Link>

      <div>
        <div className="flex items-center gap-2 mb-2">
          <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${challenge.type === 'weekly' ? 'bg-blue-100 text-blue-700 dark:bg-blue-900 dark:text-blue-300' : 'bg-violet-100 text-violet-700 dark:bg-violet-900 dark:text-violet-300'}`}>
            {challenge.type === 'weekly' ? 'Weekly' : 'Monthly'}
          </span>
          <span className="text-sm text-accent font-medium">{left} days left</span>
        </div>
        <h1 className="font-display text-2xl font-bold">{challenge.name}</h1>
        {challenge.description && (
          <p className="text-neutral-600 dark:text-neutral-400 mt-2">{challenge.description}</p>
        )}
        <div className="flex gap-6 mt-3 text-sm text-neutral-600 dark:text-neutral-400">
          {challenge.goal_books && <span>Goal: <strong>{challenge.goal_books} books</strong></span>}
          {challenge.goal_pages && <span>Goal: <strong>{challenge.goal_pages} pages</strong></span>}
          <span>{participantUsers.length} participant{participantUsers.length !== 1 ? 's' : ''}</span>
        </div>
      </div>

      {/* Join / Already joined */}
      {user && (
        <div>
          {isJoined ? (
            <div className="flex items-center gap-2 text-green-600 dark:text-green-400 font-medium">
              <span>You are participating in this challenge!</span>
            </div>
          ) : (
            <form action={`/api/challenges/${params.id}/join`} method="POST">
              <button
                type="submit"
                className="px-6 py-2 bg-accent text-white rounded-lg font-medium hover:opacity-90 transition-opacity"
              >
                Join Challenge
              </button>
            </form>
          )}
        </div>
      )}

      {/* Participants Leaderboard */}
      {participantUsers.length > 0 && (
        <section>
          <h2 className="font-semibold text-lg mb-3">Participants</h2>
          <div className="space-y-2">
            {participantUsers.map((p, i) => (
              <div
                key={p.id}
                className={`flex items-center gap-3 p-3 rounded-lg border ${p.id === user?.id ? 'border-accent bg-amber-50 dark:bg-amber-950' : 'border-neutral-200 dark:border-neutral-700'}`}
              >
                <span className="w-6 text-sm font-bold text-neutral-500 text-center">{i + 1}</span>
                <div className="relative w-8 h-8 rounded-full overflow-hidden bg-neutral-200 dark:bg-neutral-700 flex-shrink-0">
                  {p.avatar_url ? (
                    <Image src={p.avatar_url} alt={p.display_name} fill className="object-cover" sizes="32px" />
                  ) : (
                    <div className="flex items-center justify-center h-full text-sm font-bold">
                      {p.display_name[0]?.toUpperCase()}
                    </div>
                  )}
                </div>
                <div className="flex-1 min-w-0">
                  <Link href={`/user/${p.username}`} className="font-medium text-sm hover:underline">
                    {p.display_name}
                    {p.id === user?.id && <span className="text-accent ml-1">(you)</span>}
                  </Link>
                </div>
                <span className="text-sm font-bold text-accent">{p.xp.toLocaleString()} XP</span>
              </div>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}

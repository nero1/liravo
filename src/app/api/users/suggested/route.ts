import { createClient } from '@/lib/supabase/server';
import { NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/auth/getCurrentUser';

export const dynamic = 'force-dynamic';

// GET /api/users/suggested — returns suggested users to follow during onboarding
// Priority: verified authors, then high-XP readers
export async function GET() {
  const user = await getCurrentUser();
  const supabase = createClient();

  // Get users the current user is already following
  const alreadyFollowing = new Set<string>();
  if (user) {
    const { data: follows } = await supabase
      .from('follows')
      .select('following_id')
      .eq('follower_id', user.id);
    for (const f of follows ?? []) alreadyFollowing.add(f.following_id);
  }

  // Fetch verified authors first
  const { data: authors } = await supabase
    .from('users')
    .select('id, display_name, username, avatar_url, is_verified_author, xp')
    .eq('is_verified_author', true)
    .eq('is_suspended', false)
    .eq('is_banned', false)
    .order('xp', { ascending: false })
    .limit(10);

  // Fetch high-XP readers (not authors)
  const { data: readers } = await supabase
    .from('users')
    .select('id, display_name, username, avatar_url, is_verified_author, xp')
    .eq('is_verified_author', false)
    .eq('is_suspended', false)
    .eq('is_banned', false)
    .order('xp', { ascending: false })
    .limit(10);

  const combined = [
    ...(authors ?? []),
    ...(readers ?? []),
  ]
    .filter((u) => u.id !== user?.id && !alreadyFollowing.has(u.id))
    .slice(0, 10)
    .map(({ id, display_name, username, avatar_url, is_verified_author }) => ({
      id, display_name, username, avatar_url, is_verified_author,
    }));

  return NextResponse.json({ users: combined });
}

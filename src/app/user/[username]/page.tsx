import { notFound } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { createServiceClient } from '@/lib/supabase/server';
import { ProfileView } from '@/components/profile/ProfileView';
import type { Metadata } from 'next';

export const dynamic = 'force-dynamic';

const APP_URL = process.env.NEXT_PUBLIC_APP_URL ?? 'https://liravo.org';

interface ProfilePageProps {
  params: { username: string };
}

export async function generateMetadata({ params }: ProfilePageProps): Promise<Metadata> {
  const supabase = createServiceClient();
  const { data } = await supabase
    .from('users')
    .select('display_name, bio, avatar_url')
    .eq('username', params.username)
    .single();

  if (!data) return { title: 'Profile not found' };

  return {
    title: `${data.display_name} (@${params.username})`,
    description: data.bio ?? `${data.display_name}'s reading profile on Liravo`,
    alternates: {
      canonical: `${APP_URL}/user/${params.username}`,
    },
    openGraph: {
      title: `${data.display_name} on Liravo`,
      description: data.bio ?? '',
      url: `${APP_URL}/user/${params.username}`,
      images: data.avatar_url ? [data.avatar_url] : [],
    },
  };
}

export default async function PublicProfilePage({ params }: ProfilePageProps) {
  const supabase = createServiceClient();
  const { data: profile } = await supabase
    .from('users')
    .select('*')
    .eq('username', params.username)
    .eq('is_banned', false)
    .single();

  if (!profile) notFound();

  const { data: { user } } = await createClient().auth.getUser();
  const isOwner = user?.id === profile.id;
  const isAdmin = false; // Admin check happens inside ProfileView if needed

  // Enforce profile_visibility
  if (profile.profile_visibility === 'followers_only' && !isOwner) {
    if (!user) {
      return (
        <div className="max-w-xl mx-auto px-4 py-20 text-center">
          <p className="text-2xl mb-2">🔒</p>
          <h1 className="font-display text-xl font-bold mb-2">This profile is private</h1>
          <p className="text-muted-foreground text-sm">Only followers can view this profile.</p>
        </div>
      );
    }
    const { data: followRow } = await supabase
      .from('follows')
      .select('follower_id')
      .eq('follower_id', user.id)
      .eq('following_id', profile.id)
      .maybeSingle();
    if (!followRow && !isAdmin) {
      return (
        <div className="max-w-xl mx-auto px-4 py-20 text-center">
          <p className="text-2xl mb-2">🔒</p>
          <h1 className="font-display text-xl font-bold mb-2">This profile is private</h1>
          <p className="text-muted-foreground text-sm">Only followers can view this profile.</p>
        </div>
      );
    }
  }

  // Fetch earned badges for this user
  const { data: userBadges } = await supabase
    .from('user_badges')
    .select('badge_id, awarded_at')
    .eq('user_id', profile.id)
    .order('awarded_at', { ascending: false });

  // Map badge IDs to badge definitions
  const { BADGE_DEFINITIONS } = await import('@/services/badges');
  const earnedBadges = (userBadges ?? []).map((ub: { badge_id: string }) => {
    const def = BADGE_DEFINITIONS.find((b) => b.id === ub.badge_id);
    return def ? { icon: def.icon, name: def.name } : null;
  }).filter(Boolean);

  const profileWithBadges = { ...profile, badges: earnedBadges };

  return <ProfileView profile={profileWithBadges} isOwner={isOwner} />;
}

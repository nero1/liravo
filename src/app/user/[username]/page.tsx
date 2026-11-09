import {getTranslations} from 'next-intl/server';
import {getEarnedBadges} from '@/services/badges';
import { languageAlternates } from '@/lib/metadata';
import { PUBLIC_USER_COLUMNS } from '@/lib/user-profile';
import { notFound } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { createServiceClient } from '@/lib/supabase/server';
import { ProfileView } from '@/components/profile/ProfileView';
import type { Metadata } from 'next';

export const dynamic = 'force-dynamic';

const APP_URL = process.env.NEXT_PUBLIC_APP_URL ?? 'https://liravo.org';

interface ProfilePageProps {
  params: Promise<{ username: string }>;
}

export async function generateMetadata(props: ProfilePageProps): Promise<Metadata> {
  const params = await props.params;
  const t=await getTranslations('profile');
  const supabase = createServiceClient();
  const { data } = await supabase
    .from('users')
    .select('display_name, bio, avatar_url, profile_visibility, is_banned')
    .eq('username', params.username)
    .is('deleted_at',null)
    .single();

  if (!data || data.is_banned || data.profile_visibility !== 'public') return { title:t('title'), robots: { index: false, follow: false } };

  return {
    title: `${data.display_name} (@${params.username})`,
    description: data.bio ?? t('metadataDescription',{name:data.display_name}),
    alternates: languageAlternates(`/user/${encodeURIComponent(params.username)}`),
    twitter: { card: 'summary', title: `${data.display_name} (@${params.username})`, description: data.bio ?? '', images: data.avatar_url ? [data.avatar_url] : [] },
    openGraph: {
      title: t('metadataTitle',{name:data.display_name}),
      description: data.bio ?? '',
      url: `${APP_URL}/user/${params.username}`,
      images: data.avatar_url ? [data.avatar_url] : [],
    },
  };
}

export default async function PublicProfilePage(props: ProfilePageProps) {
  const params = await props.params;
  const t=await getTranslations('profile');
  const supabase = createServiceClient();
  const { data: profile } = await supabase
    .from('users')
    .select(PUBLIC_USER_COLUMNS)
    .eq('username', params.username)
    .eq('is_banned', false)
    .is('deleted_at',null)
    .single();

  if (!profile) notFound();

  const { data: { user } } = await (await createClient()).auth.getUser();
  const isOwner = user?.id === profile.id;
  const isAdmin = false; // Admin check happens inside ProfileView if needed

  // Enforce profile_visibility
  if (profile.profile_visibility === 'followers_only' && !isOwner) {
    if (!user) {
      return (
        <div className="max-w-xl mx-auto px-4 py-20 text-center">
          <p className="text-2xl mb-2">🔒</p>
          <h1 className="font-display text-xl font-bold mb-2">{t('privateTitle')}</h1>
          <p className="text-muted-foreground text-sm">{t('privateDescription')}</p>
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
          <h1 className="font-display text-xl font-bold mb-2">{t('privateTitle')}</h1>
          <p className="text-muted-foreground text-sm">{t('privateDescription')}</p>
        </div>
      );
    }
  }

  const earnedBadges=await getEarnedBadges(profile.id);

  const profileWithBadges = { ...profile, badges: earnedBadges };

  return <ProfileView profile={profileWithBadges} isOwner={isOwner} />;
}

import {useTranslations} from '@/hooks/useTranslations';
import { QueryError } from '@/components/ui/EmptyState';
import { View, Text, ScrollView, ActivityIndicator } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLocalSearchParams } from 'expo-router';
import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';

import { Avatar } from '@/components/ui/Avatar';
import { Badge } from '@/components/ui/Badge';
import { FollowButton } from '@/components/social/FollowButton';
import { useAuthStore } from '@/stores/auth';
import { getUserLevel, type UserRow } from '@/types';

interface ProfileResponse {
  user: UserRow & { is_following: boolean; followers_count: number; following_count: number };
}

export default function UserProfileScreen() {
  const {t,locale}=useTranslations('profile'),{t:nav}=useTranslations('nativeNavigation'),{t:badgeText,has:hasBadge}=useTranslations('badgeNames');
  const { username } = useLocalSearchParams<{ username: string }>();
  const { user: currentUser } = useAuthStore();

  const { data, isLoading,error,refetch } = useQuery({
    queryKey: ['user', username],
    queryFn: () => api.get<ProfileResponse>(`/api/users/${username}`),
    enabled: !!username,
  });

  const profile = data?.user;

  if(error)return <QueryError error={error} retry={()=>void refetch()} />;

  if (isLoading || !profile) {
    return (
      <View className="flex-1 items-center justify-center bg-background">
        <ActivityIndicator color="#d97706" size="large" />
      </View>
    );
  }

  const level = getUserLevel(profile.xp);
  const isOwnProfile = currentUser?.username === username;

  return (
    <SafeAreaView className="flex-1 bg-background" edges={['bottom']}>
      <ScrollView contentContainerStyle={{ paddingBottom: 32 }}>
        <View className="px-4 py-6 gap-4">
          <View className="flex-row items-center gap-4">
            <Avatar uri={profile.avatar_url} name={profile.display_name} size={72} />
            <View className="flex-1 gap-1">
              <Text className="text-xl font-bold text-foreground">{profile.display_name}</Text>
              <Text className="text-muted-foreground">@{profile.username}</Text>
              <View className="flex-row gap-2 flex-wrap">
                <Badge variant="accent">{t('levels.'+level.min)}</Badge>
                {profile.is_verified_author && <Badge variant="secondary">✓ {t('verified')}</Badge>}
              </View>
            </View>
          </View>

          {!isOwnProfile && (
            <FollowButton userId={profile.id} isFollowing={profile.is_following} />
          )}

          {profile.bio && <Text className="text-foreground">{profile.bio}</Text>}

          {!!profile.badges?.length&&<View className="gap-2"><Text className="font-semibold text-foreground">{t('badges')}</Text><View className="flex-row flex-wrap gap-2">{profile.badges.map(badge=><Badge key={badge.id??badge.name} variant="secondary">{badge.icon} {badge.id&&hasBadge(badge.id)?badgeText(badge.id):badge.name}</Badge>)}</View></View>}
          <View className="flex-row bg-muted rounded-xl overflow-hidden">
            {[
              { label: nav('books'), value: profile.books_read_count },
              { label: t('followers'), value: profile.followers_count ?? 0 },
              { label: t('following'), value: profile.following_count ?? 0 },
            ].map(({ label, value }, i) => (
              <View
                key={label}
                className={`flex-1 py-3 items-center ${i < 2 ? 'border-r border-border' : ''}`}
              >
                <Text className="font-bold text-foreground text-lg">{value.toLocaleString(locale)}</Text>
                <Text className="text-xs text-muted-foreground">{label}</Text>
              </View>
            ))}
          </View>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

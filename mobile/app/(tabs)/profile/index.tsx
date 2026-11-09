import {useQuery} from '@tanstack/react-query';
import {api} from '@/lib/api';
import type {UserRow} from '@/types';
import {ActivityIndicator, View, Text, ScrollView, TouchableOpacity, RefreshControl } from 'react-native';
import {Button} from '@/components/ui/Button';
import {useTranslations} from '@/hooks/useTranslations';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { Settings, BookOpen, Zap, Flame } from 'lucide-react-native';
import { useAuthStore } from '@/stores/auth';
import { useAuth } from '@/hooks/useAuth';
import { Avatar } from '@/components/ui/Avatar';
import { Badge } from '@/components/ui/Badge';
import { getUserLevel } from '@/types';

export default function ProfileScreen() {
  const {t,locale}=useTranslations('profile'),{t:badgeText,has:hasBadge}=useTranslations('badgeNames'),{t:common}=useTranslations('common');
  const router = useRouter(),{t:nav}=useTranslations('nav'),{t:navigation}=useTranslations('nativeNavigation');
  const { user } = useAuthStore();
  const { fetchProfile } = useAuth();

  const badgeQuery=useQuery({queryKey:['user',user?.username],enabled:!!user,queryFn:async({signal})=>{const data=await api.get<{user:UserRow}>('/api/users/'+user!.username,undefined,signal);if(data.user.id!==user!.id)throw new Error('Account changed');return data;}});

  if (!user) return null;
  const level = getUserLevel(user.xp);

  const stats = [
    { icon: BookOpen, label: t('booksRead'), value: user.books_read_count.toLocaleString(locale) },
    { icon: Flame, label: t('streakLabel'), value: t('streakDays',{count:user.reading_streak}) },
    { icon: Zap, label: 'XP', value: user.xp.toLocaleString(locale) },
  ];

  return (
    <SafeAreaView className="flex-1 bg-background" edges={['top']}>
      <ScrollView
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={false} onRefresh={()=>{void fetchProfile();void badgeQuery.refetch();}} tintColor="#d97706" />}
      >
        {/* Header */}
        <View className="flex-row items-center justify-between px-4 py-3">
          <Text className="text-2xl font-bold text-foreground">{nav('profile')}</Text>
          <View className="flex-row gap-2">
            <TouchableOpacity accessibilityRole="button" accessibilityLabel={navigation('settings')} onPress={() => router.push('/settings')} className="p-2">
              <Settings size={22} color="#6b7280" />
            </TouchableOpacity>
          </View>
        </View>

        {/* Profile card */}
        <View className="px-4 gap-4">
          <View className="flex-row items-center gap-4">
            <Avatar uri={user.avatar_url} name={user.display_name} size={72} />
            <View className="flex-1 gap-1">
              <Text className="text-xl font-bold text-foreground">{user.display_name}</Text>
              <Text className="text-muted-foreground">@{user.username}</Text>
              <View className="flex-row gap-2 flex-wrap">
                <Badge variant="accent">{t('levels.'+level.min)}</Badge>
                {user.is_verified_author && <Badge variant="secondary">✓ {t('verified')}</Badge>}
                {user.is_creator && <Badge variant="secondary">{t('creator')}</Badge>}
              </View>
            </View>
          </View>

          {user.bio && <Text className="text-foreground">{user.bio}</Text>}

          <TouchableOpacity accessibilityRole="link"
            onPress={() => router.push('/(tabs)/profile/edit')}
            className="border border-border rounded-xl py-2.5 items-center"
            activeOpacity={0.7}
          >
            <Text className="font-medium text-foreground">{t('editProfile')}</Text>
          </TouchableOpacity>

          {/* Stats row */}
          <View className="flex-row bg-muted rounded-xl overflow-hidden">
            {stats.map(({ icon: Icon, label, value }, i) => (
              <View key={label} className={`flex-1 py-3 items-center gap-0.5 ${i < stats.length - 1 ? 'border-r border-border' : ''}`}>
                <Text className="font-bold text-foreground text-lg">{value}</Text>
                <Text className="text-xs text-muted-foreground">{label}</Text>
              </View>
            ))}
          </View>

          {badgeQuery.isLoading?<ActivityIndicator accessibilityLabel={common('loading')} color="#d97706"/>:badgeQuery.error?<View className="gap-2"><Text className="text-muted-foreground">{common('error')}</Text><Button variant="outline" onPress={()=>void badgeQuery.refetch()}>{common('retry')}</Button></View>:!!badgeQuery.data?.user.badges?.length&&<View className="gap-2"><Text className="font-semibold text-foreground">{t('badges')}</Text><View className="flex-row flex-wrap gap-2">{badgeQuery.data.user.badges.map(badge=><Badge key={badge.id??badge.name} variant="secondary">{badge.icon} {badge.id&&hasBadge(badge.id)?badgeText(badge.id):badge.name}</Badge>)}</View></View>}

          {/* Quick links */}
          <View className="gap-1">
            {[
              { label: '📊 '+navigation('readingStats'), path: '/stats' },
              { label: '🎯 '+navigation('readingGoal'), path: '/reading-goals' },
              { label: '📚 '+navigation('aRCs'), path: '/arcs' },
              { label: '🏆 '+navigation('leaderboard'), path: '/leaderboard' },
              { label: '📝 '+navigation('readingLists'), path: '/lists' },
              { label: '💬 '+navigation('myQuotes'), path: '/quotes' },
              { label: '🎁 '+navigation('referral'), path: '/referral' },
              ...(user.is_verified_author ? [{ label: '📖 '+navigation('aRCs'), path: '/author/arcs' }] : []),
              ...(user.is_creator ? [{ label: '💰 '+navigation('earnings'), path: '/earnings' }] : []),
              ...((user.is_moderator||user.is_admin) ? [{ label: '🛡️ '+navigation('reports'), path: '/moderation/reports' },{ label: '⚖️ '+navigation('appeals'), path: '/moderation/appeals' }] : []),
              ...(user.is_admin ? [{ label: '📋 '+navigation('moderationLog'), path: '/moderation/log' }] : []),
              ...(user.is_admin ? [{ label: '⚙️ '+navigation('admin'), path: '/admin' }] : []),
            ].map(({ label, path }) => (
              <TouchableOpacity accessibilityRole="link"
                key={path}
                onPress={() => router.push(path as any)}
                className="flex-row items-center justify-between py-3.5 border-b border-border"
                activeOpacity={0.7}
              >
                <Text className="text-foreground">{label}</Text>
                <Text className="text-muted-foreground">›</Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>

        <View className="h-8" />
      </ScrollView>
    </SafeAreaView>
  );
}

import {useTranslations} from '@/hooks/useTranslations';
import { View, Text, ScrollView, TouchableOpacity, RefreshControl } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { Settings, BookOpen, Zap, Flame } from 'lucide-react-native';
import { useAuthStore } from '@/stores/auth';
import { useAuth } from '@/hooks/useAuth';
import { Avatar } from '@/components/ui/Avatar';
import { Badge } from '@/components/ui/Badge';
import { getUserLevel } from '@/types';

export default function ProfileScreen() {
  const {t,locale}=useTranslations('profile');
  const router = useRouter(),{t:nav}=useTranslations('nav'),{t:navigation}=useTranslations('nativeNavigation');
  const { user } = useAuthStore();
  const { fetchProfile } = useAuth();

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
        refreshControl={<RefreshControl refreshing={false} onRefresh={fetchProfile} tintColor="#d97706" />}
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

          <TouchableOpacity
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
              ...(user.is_moderator ? [{ label: '🛡️ '+navigation('reports'), path: '/moderation/reports' }] : []),
              ...(user.is_admin ? [{ label: '⚙️ '+navigation('admin'), path: '/admin' }] : []),
            ].map(({ label, path }) => (
              <TouchableOpacity
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

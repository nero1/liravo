import { View, Text, ScrollView, TouchableOpacity, RefreshControl } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { Settings, Edit, Shield, BookOpen, Users, Zap, Flame } from 'lucide-react-native';
import { useAuthStore } from '@/stores/auth';
import { useAuth } from '@/hooks/useAuth';
import { Avatar } from '@/components/ui/Avatar';
import { Badge } from '@/components/ui/Badge';
import { getUserLevel } from '@/types';

export default function ProfileScreen() {
  const router = useRouter();
  const { user } = useAuthStore();
  const { fetchProfile } = useAuth();

  if (!user) return null;
  const level = getUserLevel(user.xp);

  const stats = [
    { icon: BookOpen, label: 'Books Read', value: user.books_read_count },
    { icon: Flame, label: 'Streak', value: `${user.reading_streak}d` },
    { icon: Zap, label: 'XP', value: user.xp.toLocaleString() },
  ];

  return (
    <SafeAreaView className="flex-1 bg-background" edges={['top']}>
      <ScrollView
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={false} onRefresh={fetchProfile} tintColor="#d97706" />}
      >
        {/* Header */}
        <View className="flex-row items-center justify-between px-4 py-3">
          <Text className="text-2xl font-bold text-foreground">Profile</Text>
          <View className="flex-row gap-2">
            <TouchableOpacity onPress={() => router.push('/settings/index')} className="p-2">
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
                <Badge variant="accent">{level.title}</Badge>
                {user.is_verified_author && <Badge variant="secondary">✓ Author</Badge>}
                {user.is_creator && <Badge variant="secondary">Creator</Badge>}
              </View>
            </View>
          </View>

          {user.bio && <Text className="text-foreground">{user.bio}</Text>}

          <TouchableOpacity
            onPress={() => router.push('/(tabs)/profile/edit')}
            className="border border-border rounded-xl py-2.5 items-center"
            activeOpacity={0.7}
          >
            <Text className="font-medium text-foreground">Edit Profile</Text>
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
              { label: '📊 Reading Stats', path: '/stats' },
              { label: '🏆 Leaderboard', path: '/leaderboard' },
              { label: '📝 My Lists', path: '/lists/index' },
              { label: '💬 My Quotes', path: '/quotes/index' },
              { label: '🎁 Referral', path: '/referral/index' },
              ...(user.is_creator ? [{ label: '💰 Earnings', path: '/earnings/index' }] : []),
              ...(user.is_moderator ? [{ label: '🛡️ Moderation', path: '/moderation/reports' }] : []),
              ...(user.is_admin ? [{ label: '⚙️ Admin Panel', path: '/admin/index' }] : []),
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

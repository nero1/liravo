import { View, Text, ScrollView, ActivityIndicator } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { ENDPOINTS } from '@/constants/api';
import { Card } from '@/components/ui/Card';
import type { ReadingStatsRow } from '@/types';

export default function StatsScreen() {
  const { data, isLoading } = useQuery({
    queryKey: ['stats'],
    queryFn: () => api.get<{ stats: ReadingStatsRow }>(ENDPOINTS.stats.reading),
  });

  const stats = data?.stats;

  if (isLoading || !stats) {
    return <View className="flex-1 items-center justify-center bg-background"><ActivityIndicator color="#d97706" size="large" /></View>;
  }

  const goalProgress = stats.annual_goal ? Math.min(100, (stats.annual_progress / stats.annual_goal) * 100) : 0;

  return (
    <SafeAreaView className="flex-1 bg-background" edges={['bottom']}>
      <ScrollView className="px-4" contentContainerStyle={{ paddingTop: 16, paddingBottom: 32, gap: 16 }}>
        {/* Annual goal */}
        {stats.annual_goal && (
          <Card>
            <Text className="font-semibold text-foreground mb-2">📅 Annual Reading Goal</Text>
            <Text className="text-3xl font-bold text-foreground">
              {stats.annual_progress} / {stats.annual_goal}
            </Text>
            <Text className="text-muted-foreground text-sm mb-3">books this year</Text>
            <View className="h-2 bg-muted rounded-full overflow-hidden">
              <View className="h-full bg-accent rounded-full" style={{ width: `${goalProgress}%` }} />
            </View>
            <Text className="text-xs text-muted-foreground mt-1">{Math.round(goalProgress)}% complete</Text>
          </Card>
        )}

        {/* Core stats */}
        <View className="flex-row flex-wrap gap-3">
          {[
            { emoji: '📚', label: 'Books Read', value: stats.books_read },
            { emoji: '📄', label: 'Pages Read', value: stats.pages_read.toLocaleString() },
            { emoji: '⭐', label: 'Reviews', value: stats.reviews_written },
            { emoji: '💬', label: 'Quotes', value: stats.quotes_saved },
            { emoji: '🔥', label: 'Current Streak', value: `${stats.current_streak}d` },
            { emoji: '🏆', label: 'Best Streak', value: `${stats.longest_streak}d` },
          ].map(({ emoji, label, value }) => (
            <Card key={label} className="flex-1 min-w-[45%]">
              <Text className="text-2xl">{emoji}</Text>
              <Text className="text-xl font-bold text-foreground mt-1">{value}</Text>
              <Text className="text-xs text-muted-foreground">{label}</Text>
            </Card>
          ))}
        </View>

        {/* Favorite genres */}
        {stats.favorite_genres.length > 0 && (
          <Card>
            <Text className="font-semibold text-foreground mb-2">🎭 Favorite Genres</Text>
            <View className="flex-row flex-wrap gap-2">
              {stats.favorite_genres.map((g) => (
                <View key={g} className="bg-muted rounded-full px-3 py-1">
                  <Text className="text-sm text-foreground">{g}</Text>
                </View>
              ))}
            </View>
          </Card>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

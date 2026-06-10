import { View, Text, ScrollView, ActivityIndicator } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { ENDPOINTS } from '@/constants/api';
import { Card } from '@/components/ui/Card';

interface WrappedData {
  year: number;
  displayName: string;
  booksRead: number;
  pagesRead: number;
  topGenres: string[];
  topMood: string | null;
  streakMax: number;
  badgesEarned: number;
  totalXp: number;
  favouriteAuthor: string | null;
  longestBook: { title: string; pageCount: number } | null;
  shortestBook: { title: string; pageCount: number } | null;
  mostActiveMonth: string | null;
  readerTitle: string;
}

export default function WrappedScreen() {
  const { data, isLoading } = useQuery({
    queryKey: ['wrapped'],
    queryFn: () => api.get<WrappedData>(ENDPOINTS.wrapped),
  });

  if (isLoading) {
    return (
      <View className="flex-1 items-center justify-center bg-background">
        <ActivityIndicator color="#d97706" size="large" />
      </View>
    );
  }

  if (!data) {
    return (
      <View className="flex-1 items-center justify-center bg-background px-4">
        <Text className="text-muted-foreground text-center">
          Your year in books is not available yet. Check back at year end!
        </Text>
      </View>
    );
  }

  const wrapped = data;

  return (
    <SafeAreaView className="flex-1 bg-background" edges={['bottom']}>
      <ScrollView className="px-4" contentContainerStyle={{ paddingTop: 16, paddingBottom: 32 }}>
        <Text className="text-2xl font-bold text-foreground text-center mb-1">
          {wrapped.displayName}&apos;s {wrapped.year} in Books
        </Text>
        <Text className="text-center text-accent font-semibold mb-4">{wrapped.readerTitle}</Text>

        <View className="gap-4">
          <Card>
            <Text className="text-5xl font-bold text-foreground text-center">{wrapped.booksRead}</Text>
            <Text className="text-center text-muted-foreground mt-1">Books Read</Text>
          </Card>

          <Card>
            <Text className="text-4xl font-bold text-foreground text-center">
              {(wrapped.pagesRead ?? 0).toLocaleString()}
            </Text>
            <Text className="text-center text-muted-foreground mt-1">Pages Turned</Text>
          </Card>

          {(wrapped.topGenres ?? []).length > 0 && (
            <Card>
              <Text className="font-semibold text-foreground mb-2">Top Genres</Text>
              <View className="flex-row flex-wrap gap-2">
                {wrapped.topGenres.map((g) => (
                  <View key={g} className="bg-accent/10 rounded-full px-3 py-1">
                    <Text className="text-accent text-sm font-medium">{g}</Text>
                  </View>
                ))}
              </View>
            </Card>
          )}

          {wrapped.topMood && (
            <Card>
              <Text className="font-semibold text-foreground mb-1">Most Common Mood Tag</Text>
              <Text className="text-xl font-bold text-accent">{wrapped.topMood}</Text>
            </Card>
          )}

          {wrapped.favouriteAuthor && (
            <Card>
              <Text className="font-semibold text-foreground mb-1">Favourite Author</Text>
              <Text className="text-xl font-bold text-foreground">{wrapped.favouriteAuthor}</Text>
            </Card>
          )}

          {wrapped.mostActiveMonth && (
            <Card>
              <Text className="font-semibold text-foreground mb-1">Most Active Month</Text>
              <Text className="text-xl font-bold text-foreground">{wrapped.mostActiveMonth}</Text>
            </Card>
          )}

          {wrapped.longestBook && (
            <Card>
              <Text className="font-semibold text-foreground mb-1">Longest Book</Text>
              <Text className="text-base font-bold text-foreground" numberOfLines={2}>{wrapped.longestBook.title}</Text>
              <Text className="text-sm text-muted-foreground">{wrapped.longestBook.pageCount.toLocaleString()} pages</Text>
            </Card>
          )}

          {wrapped.shortestBook && (
            <Card>
              <Text className="font-semibold text-foreground mb-1">Shortest Book</Text>
              <Text className="text-base font-bold text-foreground" numberOfLines={2}>{wrapped.shortestBook.title}</Text>
              <Text className="text-sm text-muted-foreground">{wrapped.shortestBook.pageCount.toLocaleString()} pages</Text>
            </Card>
          )}

          <Card>
            <View className="flex-row justify-between">
              <View className="items-center flex-1">
                <Text className="text-3xl font-bold text-foreground">{wrapped.streakMax}</Text>
                <Text className="text-xs text-muted-foreground text-center">Longest Streak</Text>
              </View>
              <View className="items-center flex-1">
                <Text className="text-3xl font-bold text-foreground">{wrapped.badgesEarned}</Text>
                <Text className="text-xs text-muted-foreground text-center">Badges Earned</Text>
              </View>
              <View className="items-center flex-1">
                <Text className="text-3xl font-bold text-accent">{(wrapped.totalXp ?? 0).toLocaleString()}</Text>
                <Text className="text-xs text-muted-foreground text-center">XP Gained</Text>
              </View>
            </View>
          </Card>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

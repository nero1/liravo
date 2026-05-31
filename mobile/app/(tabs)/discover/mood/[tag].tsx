import { View, Text, FlatList, ActivityIndicator } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLocalSearchParams } from 'expo-router';
import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { ENDPOINTS } from '@/constants/api';
import { BookCard } from '@/components/books/BookCard';
import { EmptyState } from '@/components/ui/EmptyState';
import type { BookRow } from '@/types';

export default function MoodDiscoverScreen() {
  const { tag } = useLocalSearchParams<{ tag: string }>();

  const { data, isLoading } = useQuery({
    queryKey: ['books', 'mood', tag],
    queryFn: () => api.get<{ books: BookRow[] }>(ENDPOINTS.books.search, { mood: tag, limit: 30 }),
    enabled: !!tag,
  });

  const books = data?.books ?? [];

  return (
    <SafeAreaView className="flex-1 bg-background" edges={['top']}>
      <View className="px-4 py-3">
        <Text className="text-2xl font-bold text-foreground">{tag} Reads</Text>
      </View>

      {isLoading ? (
        <View className="flex-1 items-center justify-center">
          <ActivityIndicator color="#d97706" size="large" />
        </View>
      ) : (
        <FlatList
          data={books}
          keyExtractor={(b) => b.id}
          renderItem={({ item }) => (
            <View className="px-4 py-2">
              <BookCard book={item} compact />
            </View>
          )}
          ListEmptyComponent={<EmptyState title="No books found" description="Try a different mood." />}
          contentContainerStyle={{ paddingBottom: 24 }}
        />
      )}
    </SafeAreaView>
  );
}

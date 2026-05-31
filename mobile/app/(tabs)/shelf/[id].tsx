import { View, Text, FlatList, TouchableOpacity, ActivityIndicator } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useQuery } from '@tanstack/react-query';
import { Image } from 'expo-image';
import { api } from '@/lib/api';
import { ENDPOINTS } from '@/constants/api';
import { ReadingProgressBar } from '@/components/shelf/ReadingProgressBar';
import { EmptyState } from '@/components/ui/EmptyState';
import type { ShelfRow, ShelfBookRow } from '@/types';

export default function ShelfDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();

  const { data, isLoading } = useQuery({
    queryKey: ['shelf', id],
    queryFn: () => api.get<{ shelf: ShelfRow; books: ShelfBookRow[] }>(ENDPOINTS.shelves.byId(id!)),
    enabled: !!id,
  });

  const shelf = data?.shelf;
  const books = data?.books ?? [];

  return (
    <SafeAreaView className="flex-1 bg-background" edges={['top']}>
      <View className="px-4 py-3">
        <Text className="text-2xl font-bold text-foreground">{shelf?.name ?? 'Shelf'}</Text>
        <Text className="text-muted-foreground">{books.length} books</Text>
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
            <ShelfBookItem
              shelfBook={item}
              onPress={() => router.push(`/book/${item.book_id}`)}
            />
          )}
          ListEmptyComponent={
            <EmptyState title="This shelf is empty" description="Add books to start tracking your reading." />
          }
          contentContainerStyle={{ paddingBottom: 24 }}
        />
      )}
    </SafeAreaView>
  );
}

function ShelfBookItem({
  shelfBook,
  onPress,
}: {
  shelfBook: ShelfBookRow;
  onPress: () => void;
}) {
  const book = shelfBook.book;
  const progress = shelfBook.progress_percent ?? 0;

  return (
    <TouchableOpacity
      className="flex-row px-4 py-3 gap-3 border-b border-border"
      onPress={onPress}
      activeOpacity={0.7}
    >
      <Image
        source={{ uri: book?.cover_url ?? undefined }}
        style={{ width: 52, height: 78, borderRadius: 4 }}
        contentFit="cover"
        className="bg-muted"
      />
      <View className="flex-1 justify-center gap-1.5">
        <Text className="font-semibold text-foreground" numberOfLines={2}>{book?.title ?? 'Unknown'}</Text>
        <Text className="text-sm text-muted-foreground">{book?.author_name}</Text>
        {progress > 0 && (
          <ReadingProgressBar
            percent={progress}
            pages={shelfBook.progress_pages ?? undefined}
            totalPages={book?.page_count ?? undefined}
          />
        )}
      </View>
    </TouchableOpacity>
  );
}

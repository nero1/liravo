import { FlatList, View, Text, RefreshControl, ActivityIndicator } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFeed } from '@/hooks/useFeed';
import { FeedItem } from '@/components/social/FeedItem';
import { EmptyState } from '@/components/ui/EmptyState';
import type { FeedItem as FeedItemType } from '@/types';

export default function FeedScreen() {
  const { data, isLoading, isFetchingNextPage, fetchNextPage, hasNextPage, refetch } = useFeed();

  const items = data?.pages.flatMap((p) => p.items) ?? [];

  if (isLoading) {
    return (
      <SafeAreaView className="flex-1 bg-background" edges={['top']}>
        <View className="flex-1 items-center justify-center">
          <ActivityIndicator color="#d97706" size="large" />
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView className="flex-1 bg-background" edges={['top']}>
      <View className="px-4 py-3 border-b border-border">
        <Text className="text-2xl font-bold text-foreground">Feed</Text>
      </View>

      <FlatList
        data={items}
        keyExtractor={(item) => item.id}
        renderItem={({ item }) => (
          <View className="px-4 py-2">
            <FeedItem item={item} />
          </View>
        )}
        ListEmptyComponent={
          <EmptyState
            title="Nothing here yet"
            description="Follow other readers to see their activity in your feed."
          />
        }
        onEndReached={() => hasNextPage && fetchNextPage()}
        onEndReachedThreshold={0.4}
        ListFooterComponent={
          isFetchingNextPage ? (
            <View className="py-4 items-center">
              <ActivityIndicator color="#d97706" />
            </View>
          ) : null
        }
        refreshControl={
          <RefreshControl refreshing={isLoading} onRefresh={refetch} tintColor="#d97706" />
        }
        contentContainerStyle={{ paddingBottom: 20 }}
      />
    </SafeAreaView>
  );
}

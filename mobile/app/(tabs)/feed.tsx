import { FlatList, View, Text, RefreshControl, ActivityIndicator, TouchableOpacity } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { Bell } from 'lucide-react-native';
import { useFeed } from '@/hooks/useFeed';
import { FeedItem } from '@/components/social/FeedItem';
import { EmptyState } from '@/components/ui/EmptyState';


export default function FeedScreen() {
  const router = useRouter();
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
      <View className="px-4 py-3 border-b border-border flex-row items-center justify-between">
        <Text className="text-2xl font-bold text-foreground">Feed</Text>
        <TouchableOpacity onPress={() => router.push('/notifications')} className="p-1">
          <Bell size={22} color="#6b7280" />
        </TouchableOpacity>
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

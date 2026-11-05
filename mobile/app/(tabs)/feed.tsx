import { FlatList, View, Text, RefreshControl, ActivityIndicator, TouchableOpacity } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { Bell } from 'lucide-react-native';
import { useFeed } from '@/hooks/useFeed';
import { FeedItem } from '@/components/social/FeedItem';
import {Button} from '@/components/ui/Button';
import {useTranslations} from '@/hooks/useTranslations';
import { EmptyState } from '@/components/ui/EmptyState';


export default function FeedScreen() {
  const router = useRouter(),{t}=useTranslations('feed'),common=useTranslations('common');
  const { data, isLoading, isFetchingNextPage,isRefetching,error, fetchNextPage, hasNextPage, refetch } = useFeed();

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
        <Text className="text-2xl font-bold text-foreground">{t('title')}</Text>
        <TouchableOpacity onPress={() => router.push('/notifications')} className="p-1" accessibilityRole="button" accessibilityLabel={t('notifications')}>
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
            title={t('empty')}
            description={t('emptyDescription')}
          />
        }
        onEndReached={() => hasNextPage && fetchNextPage()}
        onEndReachedThreshold={0.4}
        ListFooterComponent={
          error?<View className="p-4 gap-3"><Text accessibilityLiveRegion="polite" className="text-destructive">{t('unavailable')}</Text><Button onPress={()=>void (hasNextPage?fetchNextPage():refetch())}>{common.t('retry')}</Button></View>:isFetchingNextPage ? (
            <View className="py-4 items-center">
              <ActivityIndicator color="#d97706" />
            </View>
          ) : null
        }
        refreshControl={
          <RefreshControl refreshing={isRefetching} onRefresh={refetch} tintColor="#d97706" />
        }
        contentContainerStyle={{ paddingBottom: 20 }}
      />
    </SafeAreaView>
  );
}

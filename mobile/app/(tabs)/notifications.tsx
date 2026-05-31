import { FlatList, View, Text, TouchableOpacity, RefreshControl, ActivityIndicator } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { formatDistanceToNow } from 'date-fns';
import { useNotifications, useMarkNotificationRead } from '@/hooks/useNotifications';
import { Avatar } from '@/components/ui/Avatar';
import { EmptyState } from '@/components/ui/EmptyState';
import { Bell } from 'lucide-react-native';
import type { NotificationRow } from '@/types';

export default function NotificationsScreen() {
  const { data, isLoading, isFetchingNextPage, fetchNextPage, hasNextPage, refetch } = useNotifications();
  const markRead = useMarkNotificationRead();

  const notifications = data?.pages.flatMap((p) => p.notifications) ?? [];

  return (
    <SafeAreaView className="flex-1 bg-background" edges={['top']}>
      <View className="px-4 py-3 border-b border-border">
        <Text className="text-2xl font-bold text-foreground">Notifications</Text>
      </View>

      <FlatList
        data={notifications}
        keyExtractor={(n) => n.id}
        renderItem={({ item }) => (
          <NotificationItem
            notification={item}
            onPress={() => !item.is_read && markRead.mutate(item.id)}
          />
        )}
        ListEmptyComponent={
          !isLoading ? (
            <EmptyState
              title="No notifications"
              description="Activity from your followers will appear here."
              icon={<Bell size={48} color="#6b7280" />}
            />
          ) : null
        }
        ListHeaderComponent={isLoading ? <View className="py-8 items-center"><ActivityIndicator color="#d97706" /></View> : null}
        onEndReached={() => hasNextPage && fetchNextPage()}
        onEndReachedThreshold={0.4}
        ListFooterComponent={
          isFetchingNextPage ? <View className="py-4 items-center"><ActivityIndicator color="#d97706" /></View> : null
        }
        refreshControl={
          <RefreshControl refreshing={isLoading} onRefresh={refetch} tintColor="#d97706" />
        }
        contentContainerStyle={{ paddingBottom: 20 }}
      />
    </SafeAreaView>
  );
}

function NotificationItem({
  notification,
  onPress,
}: {
  notification: NotificationRow;
  onPress: () => void;
}) {
  return (
    <TouchableOpacity
      className={`flex-row px-4 py-3 gap-3 border-b border-border ${!notification.is_read ? 'bg-accent/5' : ''}`}
      onPress={onPress}
      activeOpacity={0.7}
    >
      <Avatar
        uri={notification.actor?.avatar_url}
        name={notification.actor?.display_name}
        size={40}
      />
      <View className="flex-1 gap-0.5">
        <Text className="text-foreground text-sm">{notification.message}</Text>
        <Text className="text-xs text-muted-foreground">
          {formatDistanceToNow(new Date(notification.created_at), { addSuffix: true })}
        </Text>
      </View>
      {!notification.is_read && (
        <View className="w-2 h-2 bg-accent rounded-full self-center" />
      )}
    </TouchableOpacity>
  );
}

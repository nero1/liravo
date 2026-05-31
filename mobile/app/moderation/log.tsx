import { View, Text, FlatList } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useQuery } from '@tanstack/react-query';
import { formatDistanceToNow } from 'date-fns';
import { api } from '@/lib/api';
import { ENDPOINTS } from '@/constants/api';
import { EmptyState } from '@/components/ui/EmptyState';
import { LoadingSpinner } from '@/components/ui/LoadingSpinner';

export default function ModerationLogScreen() {
  const { data, isLoading } = useQuery({ queryKey: ['moderation', 'log'], queryFn: () => api.get<{ log: any[] }>(ENDPOINTS.moderation.log) });
  const log = data?.log ?? [];
  if (isLoading) return <LoadingSpinner />;
  return (
    <SafeAreaView className="flex-1 bg-background" edges={['bottom']}>
      <FlatList data={log} keyExtractor={(l) => l.id} renderItem={({ item }) => (
        <View className="px-4 py-3 border-b border-border">
          <Text className="font-medium text-foreground">{item.action_type}</Text>
          <Text className="text-sm text-muted-foreground">by @{item.moderator?.username}</Text>
          <Text className="text-xs text-muted-foreground">{formatDistanceToNow(new Date(item.created_at), { addSuffix: true })}</Text>
        </View>
      )} ListEmptyComponent={<EmptyState title="No moderation actions" />} contentContainerStyle={{ paddingBottom: 24 }} />
    </SafeAreaView>
  );
}

import { View, Text, FlatList } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { ENDPOINTS } from '@/constants/api';
import { EmptyState } from '@/components/ui/EmptyState';
import { LoadingSpinner } from '@/components/ui/LoadingSpinner';

export default function PassTheBookScreen() {
  const { data, isLoading } = useQuery({ queryKey: ['pass-the-book'], queryFn: () => api.get<{ items: any[] }>(ENDPOINTS.passTheBook) });
  const items = data?.items ?? [];
  if (isLoading) return <LoadingSpinner />;
  return (
    <SafeAreaView className="flex-1 bg-background" edges={['bottom']}>
      <FlatList data={items} keyExtractor={(i) => i.id} renderItem={({ item }) => (
        <View className="px-4 py-4 border-b border-border">
          <Text className="font-semibold text-foreground">{item.title ?? item.book?.title}</Text>
          <Text className="text-sm text-muted-foreground">Passed by @{item.passer?.username}</Text>
        </View>
      )} ListEmptyComponent={<EmptyState title="No passes yet" description="Discover the Pass the Book feature on the web." />} contentContainerStyle={{ paddingBottom: 24 }} />
    </SafeAreaView>
  );
}

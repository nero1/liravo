import { View, Text, FlatList } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { ENDPOINTS } from '@/constants/api';
import { EmptyState } from '@/components/ui/EmptyState';
import { LoadingSpinner } from '@/components/ui/LoadingSpinner';

export default function PromotedListingsScreen() {
  const { data, isLoading } = useQuery({ queryKey: ['admin', 'promoted-listings'], queryFn: () => api.get<{ listings: any[] }>(ENDPOINTS.admin.promotedListings) });
  const listings = data?.listings ?? [];
  if (isLoading) return <LoadingSpinner />;
  return (
    <SafeAreaView className="flex-1 bg-background" edges={['bottom']}>
      <FlatList data={listings} keyExtractor={(l) => l.id} renderItem={({ item }) => (
        <View className="px-4 py-4 border-b border-border">
          <Text className="font-semibold text-foreground">{item.title ?? item.book?.title}</Text>
          <Text className="text-sm text-muted-foreground">Until {item.end_date ? new Date(item.end_date).toLocaleDateString() : 'ongoing'}</Text>
        </View>
      )} ListEmptyComponent={<EmptyState title="No promoted listings" />} contentContainerStyle={{ paddingBottom: 24 }} />
    </SafeAreaView>
  );
}

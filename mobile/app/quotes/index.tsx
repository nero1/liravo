import { View, Text, FlatList } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { ENDPOINTS } from '@/constants/api';
import { EmptyState } from '@/components/ui/EmptyState';
import { LoadingSpinner } from '@/components/ui/LoadingSpinner';
import type { QuoteRow } from '@/types';

export default function QuotesScreen() {
  const { data, isLoading } = useQuery({ queryKey: ['quotes'], queryFn: () => api.get<{ quotes: QuoteRow[] }>(ENDPOINTS.quotes) });
  const quotes = data?.quotes ?? [];
  if (isLoading) return <LoadingSpinner />;
  return (
    <SafeAreaView className="flex-1 bg-background" edges={['bottom']}>
      <FlatList data={quotes} keyExtractor={(q) => q.id} renderItem={({ item }) => (
        <View className="px-4 py-4 border-b border-border gap-1">
          <Text className="text-foreground italic">"{item.content}"</Text>
          {item.book && <Text className="text-sm text-muted-foreground">— {item.book.title}</Text>}
          {item.page_number && <Text className="text-xs text-muted-foreground">p. {item.page_number}</Text>}
        </View>
      )} ListEmptyComponent={<EmptyState title="No quotes saved" description="Save memorable quotes from books you read." />} contentContainerStyle={{ paddingBottom: 24 }} />
    </SafeAreaView>
  );
}

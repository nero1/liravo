import { View, Text, FlatList } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { ENDPOINTS } from '@/constants/api';
import { EmptyState } from '@/components/ui/EmptyState';
import { LoadingSpinner } from '@/components/ui/LoadingSpinner';

export default function SeasonalEventsScreen() {
  const { data, isLoading } = useQuery({ queryKey: ['admin', 'seasonal-events'], queryFn: () => api.get<{ events: any[] }>(ENDPOINTS.admin.seasonalEvents) });
  const events = data?.events ?? [];
  if (isLoading) return <LoadingSpinner />;
  return (
    <SafeAreaView className="flex-1 bg-background" edges={['bottom']}>
      <FlatList data={events} keyExtractor={(e) => e.id} renderItem={({ item }) => (
        <View className="px-4 py-4 border-b border-border">
          <Text className="font-semibold text-foreground">{item.title}</Text>
          <Text className="text-sm text-muted-foreground">{item.start_date && new Date(item.start_date).toLocaleDateString()} — {item.end_date && new Date(item.end_date).toLocaleDateString()}</Text>
        </View>
      )} ListEmptyComponent={<EmptyState title="No seasonal events" />} contentContainerStyle={{ paddingBottom: 24 }} />
    </SafeAreaView>
  );
}

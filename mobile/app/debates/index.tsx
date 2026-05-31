import { View, Text, FlatList, TouchableOpacity } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { ENDPOINTS } from '@/constants/api';
import { EmptyState } from '@/components/ui/EmptyState';
import { LoadingSpinner } from '@/components/ui/LoadingSpinner';

export default function DebatesScreen() {
  const router = useRouter();
  const { data, isLoading } = useQuery({ queryKey: ['debates'], queryFn: () => api.get<{ debates: any[] }>(ENDPOINTS.debates.list) });
  const debates = data?.debates ?? [];
  if (isLoading) return <LoadingSpinner />;
  return (
    <SafeAreaView className="flex-1 bg-background" edges={['bottom']}>
      <FlatList data={debates} keyExtractor={(d) => d.id} renderItem={({ item }) => (
        <TouchableOpacity className="px-4 py-4 border-b border-border" onPress={() => router.push(`/debates/${item.id}`)} activeOpacity={0.7}>
          <Text className="font-semibold text-foreground">{item.title}</Text>
          <Text className="text-sm text-muted-foreground">{item.vote_count ?? 0} votes</Text>
        </TouchableOpacity>
      )} ListEmptyComponent={<EmptyState title="No debates yet" />} contentContainerStyle={{ paddingBottom: 24 }} />
    </SafeAreaView>
  );
}

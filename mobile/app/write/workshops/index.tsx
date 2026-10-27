import { Text, FlatList, TouchableOpacity } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { ENDPOINTS } from '@/constants/api';
import { EmptyState } from '@/components/ui/EmptyState';
import { LoadingSpinner } from '@/components/ui/LoadingSpinner';

export default function WorkshopsScreen() {
  const router = useRouter();
  const { data, isLoading } = useQuery({ queryKey: ['write', 'workshops'], queryFn: () => api.get<{ workshops: any[] }>(ENDPOINTS.write.workshops) });
  const workshops = data?.workshops ?? [];
  if (isLoading) return <LoadingSpinner />;
  return (
    <SafeAreaView className="flex-1 bg-background" edges={['bottom']}>
      <FlatList data={workshops} keyExtractor={(w) => w.id} renderItem={({ item }) => (
        <TouchableOpacity className="px-4 py-4 border-b border-border" onPress={() => router.push(`/write/workshops/${item.id}`)} activeOpacity={0.7}>
          <Text className="font-semibold text-foreground">{item.title}</Text>
          {item.description && <Text className="text-sm text-muted-foreground" numberOfLines={2}>{item.description}</Text>}
          <Text className="text-xs text-muted-foreground">{item.member_count ?? 0} members</Text>
        </TouchableOpacity>
      )} ListEmptyComponent={<EmptyState title="No workshops" />} contentContainerStyle={{ paddingBottom: 24 }} />
    </SafeAreaView>
  );
}

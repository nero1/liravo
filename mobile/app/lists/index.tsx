import { View, Text, FlatList, TouchableOpacity } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { Plus } from 'lucide-react-native';
import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { ENDPOINTS } from '@/constants/api';
import { EmptyState } from '@/components/ui/EmptyState';
import { LoadingSpinner } from '@/components/ui/LoadingSpinner';
import type { ListRow } from '@/types';

export default function ListsScreen() {
  const router = useRouter();
  const { data, isLoading } = useQuery({ queryKey: ['lists'], queryFn: () => api.get<{ lists: ListRow[] }>(ENDPOINTS.lists.list) });
  const lists = data?.lists ?? [];
  if (isLoading) return <LoadingSpinner />;
  return (
    <SafeAreaView className="flex-1 bg-background" edges={['bottom']}>
      <View className="flex-row items-center justify-between px-4 py-3">
        <Text className="text-xl font-bold text-foreground">Reading Lists</Text>
        <TouchableOpacity onPress={() => router.push('/lists/new')}><Plus size={22} color="#d97706" /></TouchableOpacity>
      </View>
      <FlatList data={lists} keyExtractor={(l) => l.id} renderItem={({ item }) => (
        <TouchableOpacity className="px-4 py-4 border-b border-border" onPress={() => router.push(`/lists/${item.id}`)} activeOpacity={0.7}>
          <Text className="font-semibold text-foreground">{item.title}</Text>
          <Text className="text-sm text-muted-foreground">{item.book_count} books · {item.follower_count} followers</Text>
        </TouchableOpacity>
      )} ListEmptyComponent={<EmptyState title="No lists yet" description="Create curated book lists to share with others." />} contentContainerStyle={{ paddingBottom: 24 }} />
    </SafeAreaView>
  );
}

import { View, Text, FlatList, TouchableOpacity } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { Plus } from 'lucide-react-native';
import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { ENDPOINTS } from '@/constants/api';
import { EmptyState } from '@/components/ui/EmptyState';
import { LoadingSpinner } from '@/components/ui/LoadingSpinner';

export default function ARCsScreen() {
  const router = useRouter();
  const { data, isLoading } = useQuery({ queryKey: ['author', 'arcs'], queryFn: () => api.get<{ arcs: any[] }>(ENDPOINTS.author.arcs) });
  const arcs = data?.arcs ?? [];
  if (isLoading) return <LoadingSpinner />;
  return (
    <SafeAreaView className="flex-1 bg-background" edges={['bottom']}>
      <View className="flex-row items-center justify-between px-4 py-3">
        <Text className="text-xl font-bold text-foreground">My ARCs</Text>
        <TouchableOpacity onPress={() => router.push('/author/arcs/new')}><Plus size={22} color="#d97706" /></TouchableOpacity>
      </View>
      <FlatList data={arcs} keyExtractor={(a) => a.id} renderItem={({ item }) => (
        <TouchableOpacity className="px-4 py-4 border-b border-border" onPress={() => router.push(`/author/arcs/${item.id}`)} activeOpacity={0.7}>
          <Text className="font-semibold text-foreground">{item.title}</Text>
          <Text className="text-sm text-muted-foreground">{item.application_count ?? 0} applications</Text>
        </TouchableOpacity>
      )} ListEmptyComponent={<EmptyState title="No ARCs yet" description="Create an ARC to distribute advance copies." />} contentContainerStyle={{ paddingBottom: 24 }} />
    </SafeAreaView>
  );
}

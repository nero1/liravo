import { View, Text, FlatList, TouchableOpacity } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { Plus } from 'lucide-react-native';
import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { ENDPOINTS } from '@/constants/api';
import { EmptyState } from '@/components/ui/EmptyState';
import { LoadingSpinner } from '@/components/ui/LoadingSpinner';

export default function ReadingRoomsScreen() {
  const router = useRouter();
  const { data, isLoading } = useQuery({ queryKey: ['reading-rooms'], queryFn: () => api.get<{ rooms: any[] }>(ENDPOINTS.readingRooms.list) });
  const rooms = data?.rooms ?? [];
  if (isLoading) return <LoadingSpinner />;
  return (
    <SafeAreaView className="flex-1 bg-background" edges={['bottom']}>
      <View className="flex-row items-center justify-between px-4 py-3">
        <Text className="text-xl font-bold text-foreground">Reading Rooms</Text>
        <TouchableOpacity onPress={() => router.push('/reading-rooms/new')}><Plus size={22} color="#d97706" /></TouchableOpacity>
      </View>
      <FlatList data={rooms} keyExtractor={(r) => r.id} renderItem={({ item }) => (
        <TouchableOpacity className="px-4 py-4 border-b border-border" onPress={() => router.push(`/reading-rooms/${item.id}`)} activeOpacity={0.7}>
          <Text className="font-semibold text-foreground">{item.name ?? item.title}</Text>
          <Text className="text-sm text-muted-foreground">{item.member_count ?? 0} members</Text>
        </TouchableOpacity>
      )} ListEmptyComponent={<EmptyState title="No reading rooms" />} contentContainerStyle={{ paddingBottom: 24 }} />
    </SafeAreaView>
  );
}

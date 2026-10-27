import { View, Text, FlatList, TouchableOpacity, ActivityIndicator } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { Plus } from 'lucide-react-native';
import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { ENDPOINTS } from '@/constants/api';

import { EmptyState } from '@/components/ui/EmptyState';
import type { BuddyReadRow } from '@/types';

export default function BuddyReadsScreen() {
  const router = useRouter();
  const { data, isLoading } = useQuery({
    queryKey: ['buddy-reads'],
    queryFn: () => api.get<{ buddy_reads: BuddyReadRow[] }>(ENDPOINTS.buddyReads.list),
  });
  const reads = data?.buddy_reads ?? [];

  return (
    <SafeAreaView className="flex-1 bg-background" edges={['bottom']}>
      <View className="flex-row items-center justify-between px-4 py-3">
        <Text className="text-xl font-bold text-foreground">Buddy Reads</Text>
        <TouchableOpacity onPress={() => router.push('/buddy-reads/new')}><Plus size={22} color="#d97706" /></TouchableOpacity>
      </View>
      {isLoading ? <View className="flex-1 items-center justify-center"><ActivityIndicator color="#d97706" /></View> : (
        <FlatList
          data={reads}
          keyExtractor={(r) => r.id}
          renderItem={({ item }) => (
            <TouchableOpacity className="px-4 py-3 border-b border-border" onPress={() => router.push(`/buddy-reads/${item.id}`)} activeOpacity={0.7}>
              <Text className="font-semibold text-foreground">{item.title}</Text>
              <Text className="text-sm text-muted-foreground">{item.participant_count} participants</Text>
            </TouchableOpacity>
          )}
          ListEmptyComponent={<EmptyState title="No buddy reads" description="Start reading a book with friends." />}
          contentContainerStyle={{ paddingBottom: 24 }}
        />
      )}
    </SafeAreaView>
  );
}

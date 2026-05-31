import { View, Text, FlatList, TouchableOpacity, Alert } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { ENDPOINTS } from '@/constants/api';
import { EmptyState } from '@/components/ui/EmptyState';
import { LoadingSpinner } from '@/components/ui/LoadingSpinner';

export default function ModerationAppealsScreen() {
  const qc = useQueryClient();
  const { data, isLoading } = useQuery({ queryKey: ['moderation', 'appeals'], queryFn: () => api.get<{ appeals: any[] }>(ENDPOINTS.moderation.appeals) });
  const update = useMutation({ mutationFn: ({ id, status }: { id: string; status: string }) => api.patch(ENDPOINTS.moderation.appeals + `/${id}`, { status }), onSuccess: () => qc.invalidateQueries({ queryKey: ['moderation', 'appeals'] }), onError: (err) => Alert.alert('Error', (err as Error).message) });
  const appeals = data?.appeals ?? [];
  if (isLoading) return <LoadingSpinner />;
  return (
    <SafeAreaView className="flex-1 bg-background" edges={['bottom']}>
      <FlatList data={appeals} keyExtractor={(a) => a.id} renderItem={({ item }) => (
        <View className="px-4 py-4 border-b border-border gap-2">
          <Text className="font-medium text-foreground">@{item.user?.username}</Text>
          <Text className="text-sm text-foreground">{item.reason}</Text>
          {item.status === 'pending' && (
            <View className="flex-row gap-2">
              <TouchableOpacity onPress={() => update.mutate({ id: item.id, status: 'approved' })} className="bg-accent rounded-lg px-3 py-1.5" activeOpacity={0.7}><Text className="text-accent-foreground text-sm font-medium">Approve</Text></TouchableOpacity>
              <TouchableOpacity onPress={() => update.mutate({ id: item.id, status: 'rejected' })} className="bg-muted rounded-lg px-3 py-1.5" activeOpacity={0.7}><Text className="text-foreground text-sm">Reject</Text></TouchableOpacity>
            </View>
          )}
          {item.status !== 'pending' && <Text className="text-sm text-muted-foreground">Status: {item.status}</Text>}
        </View>
      )} ListEmptyComponent={<EmptyState title="No appeals" />} contentContainerStyle={{ paddingBottom: 24 }} />
    </SafeAreaView>
  );
}

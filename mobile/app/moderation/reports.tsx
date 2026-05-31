import { View, Text, FlatList, TouchableOpacity, Alert } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { ENDPOINTS } from '@/constants/api';
import { Badge } from '@/components/ui/Badge';
import { EmptyState } from '@/components/ui/EmptyState';
import { LoadingSpinner } from '@/components/ui/LoadingSpinner';
import type { ContentReportRow } from '@/types';

export default function ModerationReportsScreen() {
  const qc = useQueryClient();
  const { data, isLoading } = useQuery({ queryKey: ['moderation', 'reports'], queryFn: () => api.get<{ reports: ContentReportRow[] }>(ENDPOINTS.moderation.reports) });
  const action = useMutation({ mutationFn: ({ id, action }: { id: string; action: string }) => api.post(ENDPOINTS.moderation.reports + `/${id}/action`, { action }), onSuccess: () => qc.invalidateQueries({ queryKey: ['moderation', 'reports'] }), onError: (err) => Alert.alert('Error', (err as Error).message) });
  const reports = data?.reports ?? [];
  if (isLoading) return <LoadingSpinner />;
  return (
    <SafeAreaView className="flex-1 bg-background" edges={['bottom']}>
      <FlatList data={reports} keyExtractor={(r) => r.id} renderItem={({ item }) => (
        <View className="px-4 py-4 border-b border-border gap-2">
          <View className="flex-row items-center gap-2"><Badge variant={item.status === 'pending' ? 'accent' : 'default'}>{item.status}</Badge><Text className="text-sm text-muted-foreground">{item.entity_type}</Text></View>
          <Text className="text-foreground">{item.reason}</Text>
          {item.status === 'pending' && (
            <View className="flex-row gap-2">
              <TouchableOpacity onPress={() => action.mutate({ id: item.id, action: 'remove' })} className="bg-destructive rounded-lg px-3 py-1.5" activeOpacity={0.7}><Text className="text-destructive-foreground text-sm font-medium">Remove</Text></TouchableOpacity>
              <TouchableOpacity onPress={() => action.mutate({ id: item.id, action: 'dismiss' })} className="bg-muted rounded-lg px-3 py-1.5" activeOpacity={0.7}><Text className="text-foreground text-sm">Dismiss</Text></TouchableOpacity>
            </View>
          )}
        </View>
      )} ListEmptyComponent={<EmptyState title="No reports" description="All clear!" />} contentContainerStyle={{ paddingBottom: 24 }} />
    </SafeAreaView>
  );
}

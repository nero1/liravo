import { View, Text, FlatList, Switch, Alert } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { ENDPOINTS } from '@/constants/api';
import { LoadingSpinner } from '@/components/ui/LoadingSpinner';
import type { FeatureFlagRow } from '@/types';

export default function FeatureFlagsScreen() {
  const qc = useQueryClient();
  const { data, isLoading } = useQuery({ queryKey: ['admin', 'feature-flags'], queryFn: () => api.get<{ flags: FeatureFlagRow[] }>(ENDPOINTS.admin.featureFlags) });
  const toggle = useMutation({ mutationFn: ({ name, enabled }: { name: string; enabled: boolean }) => api.patch(ENDPOINTS.admin.featureFlags, { name, enabled }), onSuccess: () => qc.invalidateQueries({ queryKey: ['admin', 'feature-flags'] }), onError: (err) => Alert.alert('Error', (err as Error).message) });
  const flags = data?.flags ?? [];
  if (isLoading) return <LoadingSpinner />;
  return (
    <SafeAreaView className="flex-1 bg-background" edges={['bottom']}>
      <FlatList data={flags} keyExtractor={(f) => f.id} renderItem={({ item }) => (
        <View className="flex-row items-center px-4 py-4 border-b border-border gap-3">
          <View className="flex-1">
            <Text className="font-medium text-foreground">{item.name}</Text>
            {item.description && <Text className="text-sm text-muted-foreground">{item.description}</Text>}
          </View>
          <Switch value={item.enabled} onValueChange={(v) => toggle.mutate({ name: item.name, enabled: v })} trackColor={{ false: '#e5e7eb', true: '#d97706' }} thumbColor="#fff" />
        </View>
      )} contentContainerStyle={{ paddingBottom: 24 }} />
    </SafeAreaView>
  );
}

import { QueryError } from '@/components/ui/EmptyState';
import { View, Text, Alert, ActivityIndicator } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLocalSearchParams } from 'expo-router';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { ENDPOINTS } from '@/constants/api';
import { Button } from '@/components/ui/Button';

export default function DebateDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const qc = useQueryClient();
  const { data, isLoading,error,refetch } = useQuery({ queryKey: ['debate', id], queryFn: () => api.get<{ debate: any }>(`/api/debates/${id}`), enabled: !!id });
  const vote = useMutation({ mutationFn: (vote: 'yes'|'no') => api.post(ENDPOINTS.debates.vote(id!), { vote }), onSuccess: () => qc.invalidateQueries({ queryKey: ['debate', id] }), onError: (err) => Alert.alert('Error', (err as Error).message) });
  const debate = data?.debate;
  if(error)return <QueryError error={error} retry={()=>void refetch()} />;

  if (isLoading || !debate) return <View className="flex-1 items-center justify-center bg-background"><ActivityIndicator color="#d97706" /></View>;
  return (
    <SafeAreaView className="flex-1 bg-background" edges={['bottom']}>
      <View className="px-4 py-4 gap-4">
        <Text className="text-2xl font-bold text-foreground">{debate.question}</Text>
        {debate.description && <Text className="text-foreground">{debate.description}</Text>}
        <View className="flex-row gap-3">
          <Button onPress={() => vote.mutate('yes')} variant="primary" style={{ flex: 1 }} loading={vote.isPending} disabled={!!debate.current_vote||!debate.is_active}>👍 Yes ({debate.yes_count})</Button>
          <Button onPress={() => vote.mutate('no')} variant="outline" style={{ flex: 1 }} loading={vote.isPending} disabled={!!debate.current_vote||!debate.is_active}>👎 No ({debate.no_count})</Button>
        </View>
      </View>
    </SafeAreaView>
  );
}

import {useTranslations} from '@/hooks/useTranslations';
import { QueryError } from '@/components/ui/EmptyState';
import { View, Text, ScrollView, Alert, ActivityIndicator } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLocalSearchParams } from 'expo-router';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { ENDPOINTS } from '@/constants/api';
import { Button } from '@/components/ui/Button';
import type { ChallengeRow } from '@/types';

export default function ChallengeDetailScreen() {
  const {t:ui}=useTranslations('');
  const { id } = useLocalSearchParams<{ id: string }>();
  const qc = useQueryClient();
  const { data, isLoading,error,refetch } = useQuery({
    queryKey: ['challenge', id],
    queryFn: () => api.get<{ challenge: ChallengeRow;joined:boolean }>(ENDPOINTS.challenges.byId(id!)),
    enabled: !!id,
  });
  const join = useMutation({
    mutationFn: () => api.post(ENDPOINTS.challenges.join(id!)),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['challenge', id] }); Alert.alert('Joined!'); },
    onError: (err) => Alert.alert('Error', (err as Error).message),
  });

  const challenge = data?.challenge;
  if(error)return <QueryError error={error} retry={()=>void refetch()} />;

  if (isLoading || !challenge) return <View className="flex-1 items-center justify-center bg-background"><ActivityIndicator color="#d97706" /></View>;

  return (
    <SafeAreaView className="flex-1 bg-background" edges={['bottom']}>
      <ScrollView className="px-4" contentContainerStyle={{ paddingTop: 16, paddingBottom: 32, gap: 16 }}>
        <View className="flex-row items-center gap-2 flex-wrap">
          <Text className="text-2xl font-bold text-foreground flex-1">{challenge.title}</Text>

        </View>
        {challenge.description && <Text className="text-foreground">{challenge.description}</Text>}
        <View className="flex-row gap-4">
          <Text className="text-sm text-muted-foreground">📚 {challenge.goal_books??0} books · {challenge.goal_pages??0} pages</Text>
          <Text className="text-sm text-muted-foreground">👥 {challenge.participant_count??0}{ui('writingChallenge.joined')}</Text>
          {challenge.end_date && <Text className="text-sm text-muted-foreground">📅 Ends {new Date(challenge.end_date).toLocaleDateString()}</Text>}
        </View>
        <Button onPress={() => join.mutate()} loading={join.isPending} disabled={data?.joined||!challenge.is_active||!!challenge.end_date&&new Date(challenge.end_date)<=new Date()} size="lg">{data?.joined?"Joined":"Join Challenge"}</Button>
      </ScrollView>
    </SafeAreaView>
  );
}

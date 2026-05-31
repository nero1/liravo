import { View, Text, ScrollView, Alert, ActivityIndicator } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLocalSearchParams } from 'expo-router';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { ENDPOINTS } from '@/constants/api';
import { Button } from '@/components/ui/Button';
import type { BuddyReadRow } from '@/types';

export default function BuddyReadDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const qc = useQueryClient();
  const { data, isLoading } = useQuery({
    queryKey: ['buddy-read', id],
    queryFn: () => api.get<{ buddy_read: BuddyReadRow }>(ENDPOINTS.buddyReads.byId(id!)),
    enabled: !!id,
  });
  const join = useMutation({
    mutationFn: () => api.post(ENDPOINTS.buddyReads.join(id!)),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['buddy-read', id] }); Alert.alert('Joined!'); },
    onError: (err) => Alert.alert('Error', (err as Error).message),
  });

  const read = data?.buddy_read;
  if (isLoading || !read) return <View className="flex-1 items-center justify-center bg-background"><ActivityIndicator color="#d97706" /></View>;

  return (
    <SafeAreaView className="flex-1 bg-background" edges={['bottom']}>
      <ScrollView className="px-4" contentContainerStyle={{ paddingTop: 16, paddingBottom: 32, gap: 16 }}>
        <Text className="text-2xl font-bold text-foreground">{read.title}</Text>
        <Text className="text-muted-foreground">{read.participant_count} participants</Text>
        {read.start_date && <Text className="text-sm text-muted-foreground">Started: {new Date(read.start_date).toLocaleDateString()}</Text>}
        <Button onPress={() => join.mutate()} loading={join.isPending} size="lg">Join</Button>
      </ScrollView>
    </SafeAreaView>
  );
}

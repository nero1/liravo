import { View, Text, Alert, ActivityIndicator } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLocalSearchParams } from 'expo-router';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { ENDPOINTS } from '@/constants/api';
import { Button } from '@/components/ui/Button';

export default function WorkshopDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const qc = useQueryClient();
  const { data, isLoading } = useQuery({ queryKey: ['write', 'workshop', id], queryFn: () => api.get<{ workshop: any }>(ENDPOINTS.write.workshopById(id!)), enabled: !!id });
  const join = useMutation({ mutationFn: () => api.post(ENDPOINTS.write.joinWorkshop(id!)), onSuccess: () => { qc.invalidateQueries({ queryKey: ['write', 'workshop', id] }); Alert.alert('Joined!'); }, onError: (err) => Alert.alert('Error', (err as Error).message) });
  const workshop = data?.workshop;
  if (isLoading || !workshop) return <View className="flex-1 items-center justify-center bg-background"><ActivityIndicator color="#d97706" /></View>;
  return (
    <SafeAreaView className="flex-1 bg-background" edges={['bottom']}>
      <View className="px-4 py-4 gap-4">
        <Text className="text-2xl font-bold text-foreground">{workshop.title}</Text>
        {workshop.description && <Text className="text-foreground">{workshop.description}</Text>}
        <Text className="text-sm text-muted-foreground">{workshop.member_count ?? 0} members</Text>
        <Button onPress={() => join.mutate()} loading={join.isPending} size="lg">Join Workshop</Button>
      </View>
    </SafeAreaView>
  );
}

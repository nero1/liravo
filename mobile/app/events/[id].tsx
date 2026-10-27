import { QueryError } from '@/components/ui/EmptyState';
import { View, Text, ScrollView, Alert, ActivityIndicator } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLocalSearchParams } from 'expo-router';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { ENDPOINTS } from '@/constants/api';
import { Button } from '@/components/ui/Button';

export default function EventDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const qc = useQueryClient();
  const { data, isLoading,error,refetch } = useQuery({ queryKey: ['event', id], queryFn: () => api.get<{ event: any }>(ENDPOINTS.events.byId(id!)), enabled: !!id });
  const rsvp = useMutation({ mutationFn: () => api.post(ENDPOINTS.events.rsvp(id!)), onSuccess: () => { qc.invalidateQueries({ queryKey: ['event', id] }); Alert.alert("You're in!"); }, onError: (err) => Alert.alert('Error', (err as Error).message) });
  const event = data?.event;
  if(error)return <QueryError error={error} retry={()=>void refetch()} />;

  if (isLoading || !event) return <View className="flex-1 items-center justify-center bg-background"><ActivityIndicator color="#d97706" /></View>;
  return (
    <SafeAreaView className="flex-1 bg-background" edges={['bottom']}>
      <ScrollView className="px-4" contentContainerStyle={{ paddingTop: 16, paddingBottom: 32, gap: 16 }}>
        <Text className="text-2xl font-bold text-foreground">{event.title}</Text>
        {event.description && <Text className="text-foreground">{event.description}</Text>}
        {event.event_date && <Text className="text-sm text-muted-foreground">📅 {new Date(event.event_date).toLocaleDateString()}</Text>}
        <Button onPress={() => rsvp.mutate()} loading={rsvp.isPending} disabled={event.has_rsvp||event.is_paid||new Date(event.event_date)<=new Date()} size="lg">{event.has_rsvp?"RSVP confirmed":event.is_paid?"Paid event":"RSVP"}</Button>
      </ScrollView>
    </SafeAreaView>
  );
}

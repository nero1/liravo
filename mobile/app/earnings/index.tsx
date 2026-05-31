import { View, Text, ScrollView, Alert, ActivityIndicator } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useQuery, useMutation } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { ENDPOINTS } from '@/constants/api';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';

export default function EarningsScreen() {
  const { data, isLoading } = useQuery({ queryKey: ['earnings'], queryFn: () => api.get<{ earnings: any }>(ENDPOINTS.earnings.list) });
  const payout = useMutation({ mutationFn: () => api.post(ENDPOINTS.earnings.requestPayout), onSuccess: () => Alert.alert('Request submitted', 'Your payout will be processed within 5-7 business days.'), onError: (err) => Alert.alert('Error', (err as Error).message) });
  if (isLoading) return <View className="flex-1 items-center justify-center bg-background"><ActivityIndicator color="#d97706" /></View>;
  const earnings = data?.earnings;
  return (
    <SafeAreaView className="flex-1 bg-background" edges={['bottom']}>
      <ScrollView className="px-4" contentContainerStyle={{ paddingTop: 16, paddingBottom: 32, gap: 16 }}>
        <Card><Text className="font-semibold text-foreground mb-1">Available Balance</Text><Text className="text-4xl font-bold text-foreground">${((earnings?.available ?? 0)).toFixed(2)}</Text><Text className="text-sm text-muted-foreground mt-1">Pending: ${((earnings?.pending ?? 0)).toFixed(2)}</Text></Card>
        <Button onPress={() => payout.mutate()} loading={payout.isPending} disabled={!earnings?.available || earnings.available < 10} size="lg">Request Payout</Button>
        {(!earnings?.available || earnings.available < 10) && <Text className="text-xs text-muted-foreground text-center">Minimum $10 to request payout</Text>}
      </ScrollView>
    </SafeAreaView>
  );
}

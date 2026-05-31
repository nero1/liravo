import { View, Text, ScrollView, ActivityIndicator, TouchableOpacity } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { ENDPOINTS } from '@/constants/api';
import { Badge } from '@/components/ui/Badge';
import { Card } from '@/components/ui/Card';

interface HealthResponse {
  status: string;
  timestamp: string;
  version: string;
  services: { database: string; redis: string };
}

export default function CronStatusScreen() {
  const { data, isLoading, refetch } = useQuery({ queryKey: ['health'], queryFn: () => api.get<HealthResponse>(ENDPOINTS.health), refetchInterval: 30000 });
  if (isLoading) return <View className="flex-1 items-center justify-center bg-background"><ActivityIndicator color="#d97706" /></View>;
  return (
    <SafeAreaView className="flex-1 bg-background" edges={['bottom']}>
      <ScrollView className="px-4" contentContainerStyle={{ paddingTop: 16, paddingBottom: 32, gap: 16 }}>
        <Card className="gap-3">
          <View className="flex-row items-center justify-between"><Text className="font-semibold text-foreground">System Status</Text><Badge variant={data?.status === 'ok' ? 'accent' : 'destructive'}>{data?.status ?? 'unknown'}</Badge></View>
          <Text className="text-sm text-muted-foreground">{data?.timestamp && new Date(data.timestamp).toLocaleString()}</Text>
        </Card>
        <Card className="gap-3">
          <Text className="font-semibold text-foreground">Services</Text>
          {data?.services && Object.entries(data.services).map(([name, status]) => (
            <View key={name} className="flex-row items-center justify-between"><Text className="text-foreground capitalize">{name}</Text><Badge variant={status === 'ok' ? 'accent' : 'destructive'}>{status}</Badge></View>
          ))}
        </Card>
        <TouchableOpacity onPress={() => refetch()} className="border border-border rounded-xl py-3 items-center" activeOpacity={0.7}><Text className="text-foreground font-medium">Refresh</Text></TouchableOpacity>
      </ScrollView>
    </SafeAreaView>
  );
}

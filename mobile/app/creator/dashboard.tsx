import { View, Text, ScrollView, ActivityIndicator } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { ENDPOINTS } from '@/constants/api';
import { Card } from '@/components/ui/Card';

export default function CreatorDashboardScreen() {
  const { data, isLoading } = useQuery({ queryKey: ['creator', 'analytics'], queryFn: () => api.get<{ analytics: any }>(ENDPOINTS.creator.analytics) });
  const analytics = data?.analytics;
  if (isLoading) return <View className="flex-1 items-center justify-center bg-background"><ActivityIndicator color="#d97706" /></View>;
  return (
    <SafeAreaView className="flex-1 bg-background" edges={['bottom']}>
      <ScrollView className="px-4" contentContainerStyle={{ paddingTop: 16, paddingBottom: 32, gap: 16 }}>
        {analytics ? (
          <>
            <Card><Text className="font-semibold text-foreground mb-2">💰 Total Earnings</Text><Text className="text-3xl font-bold text-foreground">${(analytics.total_earnings ?? 0).toFixed(2)}</Text></Card>
            <Card><Text className="font-semibold text-foreground mb-2">🔗 Affiliate Clicks</Text><Text className="text-3xl font-bold text-foreground">{analytics.affiliate_clicks ?? 0}</Text></Card>
            <Card><Text className="font-semibold text-foreground mb-2">👥 Followers</Text><Text className="text-3xl font-bold text-foreground">{analytics.followers_count ?? 0}</Text></Card>
            <Card><Text className="font-semibold text-foreground mb-2">📚 Want-to-Read Triggers</Text><Text className="text-3xl font-bold text-foreground">{analytics.want_to_read_triggers ?? 0}</Text></Card>
          </>
        ) : (
          <Text className="text-muted-foreground text-center">No analytics data yet.</Text>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

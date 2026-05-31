import { View, Text, ScrollView, TouchableOpacity, Share, ActivityIndicator } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { ENDPOINTS } from '@/constants/api';
import { useAuthStore } from '@/stores/auth';
import { Card } from '@/components/ui/Card';

export default function ReferralScreen() {
  const { user } = useAuthStore();
  const { data, isLoading } = useQuery({ queryKey: ['referral', 'stats'], queryFn: () => api.get<{ stats: any }>(ENDPOINTS.referral.stats) });
  const referralLink = `${process.env.EXPO_PUBLIC_API_URL}/?ref=${user?.referral_code}`;

  async function share() {
    await Share.share({ message: `Join me on Liravo — the book discovery app! ${referralLink}`, url: referralLink });
  }

  if (isLoading) return <View className="flex-1 items-center justify-center bg-background"><ActivityIndicator color="#d97706" /></View>;
  const stats = data?.stats;
  return (
    <SafeAreaView className="flex-1 bg-background" edges={['bottom']}>
      <ScrollView className="px-4" contentContainerStyle={{ paddingTop: 16, paddingBottom: 32, gap: 16 }}>
        <Card className="gap-2">
          <Text className="font-semibold text-foreground">Your Referral Code</Text>
          <Text className="text-2xl font-bold text-accent">{user?.referral_code}</Text>
          <Text className="text-sm text-muted-foreground">Earn 10% commission on every friend who signs up.</Text>
        </Card>
        <View className="flex-row gap-3">
          <Card className="flex-1"><Text className="font-bold text-2xl text-foreground">{stats?.referral_count ?? 0}</Text><Text className="text-xs text-muted-foreground">Referrals</Text></Card>
          <Card className="flex-1"><Text className="font-bold text-2xl text-foreground">${(stats?.total_earned ?? 0).toFixed(2)}</Text><Text className="text-xs text-muted-foreground">Earned</Text></Card>
        </View>
        <TouchableOpacity onPress={share} className="bg-accent rounded-xl py-4 items-center" activeOpacity={0.8}>
          <Text className="text-accent-foreground font-semibold text-base">Share Your Link</Text>
        </TouchableOpacity>
      </ScrollView>
    </SafeAreaView>
  );
}

import { View, Text, ScrollView, Alert } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useMutation } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { ENDPOINTS } from '@/constants/api';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';

const FEATURES = ['Unlimited writing challenges', 'AI writing feedback', 'Priority ARC access', 'No ads', 'Premium badge', 'Early access to new features'];

export default function PremiumScreen() {
  const subscribe = useMutation({ mutationFn: () => api.post(ENDPOINTS.subscriptions.create, { plan: 'monthly' }), onSuccess: (data: any) => { if (data.payment_url) { /* open payment URL */ Alert.alert('Redirecting to payment...'); } }, onError: (err) => Alert.alert('Error', (err as Error).message) });
  return (
    <SafeAreaView className="flex-1 bg-background" edges={['bottom']}>
      <ScrollView className="px-4" contentContainerStyle={{ paddingTop: 16, paddingBottom: 32, gap: 16 }}>
        <View className="items-center gap-2">
          <Text className="text-3xl font-bold text-foreground">Liravo Premium</Text>
          <Text className="text-muted-foreground text-center">Unlock the full reading & writing experience</Text>
        </View>
        <Card className="gap-3">
          <Text className="text-2xl font-bold text-foreground text-center">$4.99 / month</Text>
          {FEATURES.map((f) => <Text key={f} className="text-foreground">✓ {f}</Text>)}
        </Card>
        <Button onPress={() => subscribe.mutate()} loading={subscribe.isPending} size="lg">Get Premium</Button>
      </ScrollView>
    </SafeAreaView>
  );
}

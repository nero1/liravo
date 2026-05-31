import { View, Text, ScrollView, Alert } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useQueryClient } from '@tanstack/react-query';
import { Card } from '@/components/ui/Card';
import { GooglePayButton } from '@/components/ui/GooglePayButton';
import { Button } from '@/components/ui/Button';

const FEATURES = [
  'Unlimited writing challenges',
  'AI writing feedback',
  'Priority ARC access',
  'No ads',
  'Premium badge',
  'Early access to new features',
];

// $4.99/month in cents
const PREMIUM_AMOUNT = 499;

export default function PremiumScreen() {
  const qc = useQueryClient();

  function onPaymentSuccess() {
    qc.invalidateQueries({ queryKey: ['profile'] });
    Alert.alert('Welcome to Premium!', 'Your Premium subscription is now active.');
  }

  return (
    <SafeAreaView className="flex-1 bg-background" edges={['bottom']}>
      <ScrollView className="px-4" contentContainerStyle={{ paddingTop: 16, paddingBottom: 32, gap: 16 }}>
        <View className="items-center gap-2">
          <Text className="text-3xl font-bold text-foreground">Liravo Premium</Text>
          <Text className="text-muted-foreground text-center">Unlock the full reading & writing experience</Text>
        </View>

        <Card className="gap-3">
          <Text className="text-2xl font-bold text-foreground text-center">$4.99 / month</Text>
          {FEATURES.map((f) => (
            <Text key={f} className="text-foreground">✓ {f}</Text>
          ))}
        </Card>

        <GooglePayButton
          item={{ label: 'Liravo Premium (monthly)', amount: PREMIUM_AMOUNT }}
          metadata={{ plan: 'premium_monthly' }}
          onSuccess={onPaymentSuccess}
          onError={(msg) => Alert.alert('Payment failed', msg)}
          label="Subscribe with Google Pay"
        />
      </ScrollView>
    </SafeAreaView>
  );
}

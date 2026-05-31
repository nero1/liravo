import { View, Text, ScrollView, Alert, TouchableOpacity, ActivityIndicator } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { ENDPOINTS } from '@/constants/api';
import { Card } from '@/components/ui/Card';
import { PaymentSheet } from '@/components/ui/PaymentSheet';

const FEATURES = [
  'Unlimited custom shelves',
  'Full reading statistics dashboard',
  'AI taste profile',
  'AI writing feedback & plan',
  'Weekly email digest',
  'Premium badge on profile',
];

function idempotencyKey() {
  return Array.from({ length: 16 }, () => Math.floor(Math.random() * 256).toString(16).padStart(2, '0')).join('');
}

export default function PremiumScreen() {
  const qc = useQueryClient();
  const [loading, setLoading] = useState(false);
  const [checkoutUrl, setCheckoutUrl] = useState<string | null>(null);

  async function startCheckout(provider: 'dodopayments' | 'paystack', currency: 'USD' | 'NGN') {
    setLoading(true);
    try {
      const res = await api.post<{ checkoutUrl: string }>(
        ENDPOINTS.subscriptions.create,
        { provider, currency },
        { 'idempotency-key': idempotencyKey() },
      );
      if (res.checkoutUrl) setCheckoutUrl(res.checkoutUrl);
    } catch (err) {
      Alert.alert('Error', (err as Error).message);
    } finally {
      setLoading(false);
    }
  }

  function onPaymentSuccess() {
    setCheckoutUrl(null);
    qc.invalidateQueries({ queryKey: ['profile'] });
    Alert.alert('Welcome to Premium!', 'Your subscription is now active.');
  }

  return (
    <SafeAreaView className="flex-1 bg-background" edges={['bottom']}>
      <ScrollView className="px-4" contentContainerStyle={{ paddingTop: 16, paddingBottom: 32, gap: 16 }}>
        <View className="items-center gap-2">
          <Text className="text-4xl">★</Text>
          <Text className="text-3xl font-bold text-foreground">Liravo Premium</Text>
          <Text className="text-muted-foreground text-center">
            Unlock the full reading & writing experience
          </Text>
        </View>

        <Card className="gap-3">
          <Text className="text-2xl font-bold text-foreground text-center">$4.99 / month</Text>
          {FEATURES.map((f) => (
            <Text key={f} className="text-foreground">✓ {f}</Text>
          ))}
        </Card>

        {/* Global — DodoPayments checkout (supports Google Pay, Apple Pay, cards) */}
        <TouchableOpacity
          onPress={() => startCheckout('dodopayments', 'USD')}
          disabled={loading}
          className="bg-accent rounded-xl py-4 items-center"
          activeOpacity={0.85}
        >
          {loading ? (
            <ActivityIndicator color="#fff" />
          ) : (
            <Text className="text-white font-semibold text-base">
              Subscribe — Google Pay / Card (Global)
            </Text>
          )}
        </TouchableOpacity>

        {/* Nigeria — Paystack */}
        <TouchableOpacity
          onPress={() => startCheckout('paystack', 'NGN')}
          disabled={loading}
          className="border border-accent rounded-xl py-4 items-center"
          activeOpacity={0.85}
        >
          <Text className="text-accent font-semibold text-base">Pay with Paystack (Nigeria)</Text>
        </TouchableOpacity>

        <Text className="text-center text-xs text-muted-foreground">
          Cancel anytime. No hidden fees.
        </Text>
      </ScrollView>

      {/* In-app payment WebView — DodoPayments checkout has Google Pay built in */}
      {checkoutUrl && (
        <PaymentSheet
          url={checkoutUrl}
          visible
          onSuccess={onPaymentSuccess}
          onCancel={() => setCheckoutUrl(null)}
          successPattern="activated=1"
          cancelPattern="cancelled=1"
        />
      )}
    </SafeAreaView>
  );
}

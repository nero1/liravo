import { View, Text, ScrollView, Alert, TouchableOpacity, ActivityIndicator } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useState } from 'react';
import * as WebBrowser from 'expo-web-browser';
import { api } from '@/lib/api';
import { ENDPOINTS } from '@/constants/api';
import { Card } from '@/components/ui/Card';

const FEATURES = [
  'Unlimited custom shelves',
  'Full reading statistics dashboard',
  'AI taste profile',
  'AI writing feedback & plan',
  'Weekly email digest',
  'Premium badge on profile',
];

function generateIdempotencyKey() {
  const arr = new Uint8Array(16);
  // Use Math.random as a fallback — not cryptographic but fine for idempotency keys
  for (let i = 0; i < arr.length; i++) arr[i] = Math.floor(Math.random() * 256);
  return Array.from(arr).map((b) => b.toString(16).padStart(2, '0')).join('');
}

export default function PremiumScreen() {
  const [loading, setLoading] = useState(false);

  async function handleSubscribe(provider: 'dodopayments' | 'paystack', currency: 'USD' | 'NGN') {
    setLoading(true);
    try {
      const res = await api.post<{ checkoutUrl: string }>(
        ENDPOINTS.subscriptions.create,
        { provider, currency },
        { 'idempotency-key': generateIdempotencyKey() },
      );
      if (res.checkoutUrl) {
        await WebBrowser.openBrowserAsync(res.checkoutUrl);
      }
    } catch (err) {
      Alert.alert('Error', (err as Error).message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <SafeAreaView className="flex-1 bg-background" edges={['bottom']}>
      <ScrollView className="px-4" contentContainerStyle={{ paddingTop: 16, paddingBottom: 32, gap: 16 }}>
        <View className="items-center gap-2">
          <Text className="text-4xl">★</Text>
          <Text className="text-3xl font-bold text-foreground">Liravo Premium</Text>
          <Text className="text-muted-foreground text-center">Unlock the full reading & writing experience</Text>
        </View>

        <Card className="gap-3">
          <Text className="text-2xl font-bold text-foreground text-center">$4.99 / month</Text>
          {FEATURES.map((f) => (
            <Text key={f} className="text-foreground">✓ {f}</Text>
          ))}
        </Card>

        <TouchableOpacity
          onPress={() => handleSubscribe('dodopayments', 'USD')}
          disabled={loading}
          className="bg-accent rounded-xl py-4 items-center"
          activeOpacity={0.85}
        >
          {loading ? <ActivityIndicator color="#fff" /> : (
            <Text className="text-white font-semibold text-base">Pay with Card (Global)</Text>
          )}
        </TouchableOpacity>

        <TouchableOpacity
          onPress={() => handleSubscribe('paystack', 'NGN')}
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
    </SafeAreaView>
  );
}

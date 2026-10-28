import {useTranslations} from '@/hooks/useTranslations';
import { View, Text, ScrollView, TouchableOpacity, ActivityIndicator } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useAuthStore } from '@/stores/auth';
import { Card } from '@/components/ui/Card';
import { useGooglePlayBilling } from '@/hooks/useGooglePlayBilling';

const FEATURES = [
  'Unlimited custom shelves',
  'Full reading statistics dashboard',
  'AI taste profile',
  'AI writing feedback & plan',
  'Weekly email digest',
  'Premium badge on profile',
];

export default function PremiumScreen() {
  const {t:ui}=useTranslations('');
  const { user } = useAuthStore();
  const { premiumPrice, purchasing, restoring, subscribe, restorePurchases } = useGooglePlayBilling();

  const isPremium = user?.is_premium ?? false;

  const priceLabel = premiumPrice ?? 'Price unavailable';

  return (
    <SafeAreaView className="flex-1 bg-background" edges={['bottom']}>
      <ScrollView className="px-4" contentContainerStyle={{ paddingTop: 16, paddingBottom: 32, gap: 16 }}>

        <View className="items-center gap-2">
          <Text className="text-4xl">★</Text>
          <Text className="text-3xl font-bold text-foreground">{ui('premium.title')}</Text>
          <Text className="text-muted-foreground text-center">
            Unlock the full reading & writing experience
          </Text>
        </View>

        {isPremium ? (
          <Card className="items-center gap-2 py-6">
            <Text className="text-2xl">★</Text>
            <Text className="font-bold text-lg text-foreground">{ui('premium.activeTitle')}</Text>
            <Text className="text-muted-foreground text-sm text-center">
              Enjoying all premium features, {user?.display_name ?? 'reader'}.
            </Text>
          </Card>
        ) : (
          <Card className="gap-3">
            <Text className="text-2xl font-bold text-foreground text-center">
              {premiumPrice ? `${premiumPrice} / month` : priceLabel}
            </Text>
            {FEATURES.map((f) => (
              <Text key={f} className="text-foreground">✓ {f}</Text>
            ))}
          </Card>
        )}

        {!isPremium && (
          <>
            <TouchableOpacity
              onPress={subscribe}
              disabled={!premiumPrice || purchasing || restoring}
              className="bg-accent rounded-xl py-4 items-center"
              activeOpacity={0.85}
            >
              {purchasing ? (
                <ActivityIndicator color="#fff" />
              ) : (
                <Text className="text-white font-bold text-base">
                  Subscribe — {premiumPrice ? `${premiumPrice} / month` : priceLabel}
                </Text>
              )}
            </TouchableOpacity>

            <TouchableOpacity
              onPress={restorePurchases}
              disabled={purchasing || restoring}
              className="items-center py-2"
              activeOpacity={0.7}
            >
              {restoring ? (
                <ActivityIndicator color="#d97706" size="small" />
              ) : (
                <Text className="text-accent text-sm">Restore previous purchase</Text>
              )}
            </TouchableOpacity>
          </>
        )}

        <Text className="text-center text-xs text-muted-foreground px-4">
          Subscription is charged through your Google Play account.
          Cancel anytime in the Play Store — no hidden fees.
        </Text>
      </ScrollView>
    </SafeAreaView>
  );
}

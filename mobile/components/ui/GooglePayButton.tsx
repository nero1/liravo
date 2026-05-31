import { TouchableOpacity, Text, ActivityIndicator, View } from 'react-native';
import { useGooglePay, type GooglePayItem } from '@/hooks/useGooglePay';

interface GooglePayButtonProps {
  item: GooglePayItem;
  metadata?: Record<string, string>;
  onSuccess?: () => void;
  onError?: (message: string) => void;
  label?: string;
}

export function GooglePayButton({ item, metadata, onSuccess, onError, label }: GooglePayButtonProps) {
  const { isSupported, loading, pay } = useGooglePay();

  if (!isSupported) return null;

  async function handlePress() {
    try {
      const success = await pay(item, metadata);
      if (success) onSuccess?.();
      else onError?.('Payment was cancelled.');
    } catch (err) {
      onError?.((err as Error).message);
    }
  }

  return (
    <TouchableOpacity
      onPress={handlePress}
      disabled={loading}
      className="bg-black rounded-xl py-4 flex-row items-center justify-center gap-2"
      activeOpacity={0.85}
    >
      {loading ? (
        <ActivityIndicator color="#fff" />
      ) : (
        <>
          <View className="bg-white rounded px-1 py-0.5">
            <Text className="text-black font-bold text-xs tracking-widest">G</Text>
          </View>
          <Text className="text-white font-semibold text-base">{label ?? 'Pay'}</Text>
        </>
      )}
    </TouchableOpacity>
  );
}

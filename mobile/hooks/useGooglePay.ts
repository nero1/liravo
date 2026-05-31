import { useGooglePay as useStripeGooglePay, isPlatformPaySupported } from '@stripe/stripe-react-native';
import { useEffect, useState } from 'react';
import { api } from '@/lib/api';
import { ENDPOINTS } from '@/constants/api';

export type GooglePayItem = { label: string; amount: number; currency?: string };

export function useGooglePay() {
  const [isSupported, setIsSupported] = useState(false);
  const { initGooglePay, presentGooglePay, loading } = useStripeGooglePay();

  useEffect(() => {
    isPlatformPaySupported({ googlePay: { testEnv: __DEV__ } }).then(setIsSupported);
  }, []);

  async function pay(item: GooglePayItem, metadata?: Record<string, string>): Promise<boolean> {
    await initGooglePay({ testEnv: __DEV__, merchantName: 'Liravo', countryCode: 'US' });

    // Create a payment intent on the backend
    const { clientSecret } = await api.post<{ clientSecret: string }>(
      ENDPOINTS.payments.createIntent,
      { amount: item.amount, currency: item.currency ?? 'usd', metadata },
    );

    const { error } = await presentGooglePay({
      clientSecret,
      forSetupIntent: false,
    });

    return !error;
  }

  return { isSupported, loading, pay };
}

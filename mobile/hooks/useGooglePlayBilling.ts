import { useEffect, useState, useRef, useCallback } from 'react';
import { Platform, Alert } from 'react-native';
import {
  initConnection,
  endConnection,
  getSubscriptions,
  requestSubscription,
  finishTransaction,
  purchaseUpdatedListener,
  purchaseErrorListener,
  getAvailablePurchases,
  type SubscriptionPurchase,
  type ProductPurchase,
  type Subscription,
  PurchaseStateAndroid,
} from 'react-native-iap';
import { api } from '@/lib/api';
import { useAuthStore } from '@/stores/auth';
import { SUBSCRIPTION_SKUS, PREMIUM_MONTHLY_SKU } from '@/constants/iap';

export function useGooglePlayBilling() {
  const [connected, setConnected] = useState(false);
  const [products, setProducts] = useState<Subscription[]>([]);
  const [purchasing, setPurchasing] = useState(false);
  const [restoring, setRestoring] = useState(false);
  const { setUser } = useAuthStore();
  const purchaseListenerRef = useRef<ReturnType<typeof purchaseUpdatedListener> | null>(null);
  const errorListenerRef = useRef<ReturnType<typeof purchaseErrorListener> | null>(null);

  useEffect(() => {
    if (Platform.OS !== 'android') return;

    let mounted = true;

    async function setup() {
      try {
        const ok = await initConnection();
        if (!mounted || !ok) return;
        setConnected(true);

        // Load subscription metadata from Play Store
        const subs = await getSubscriptions({ skus: [...SUBSCRIPTION_SKUS] });
        if (mounted) setProducts(subs);

        // Listen for completed purchases (fires after user approves billing sheet)
        purchaseListenerRef.current = purchaseUpdatedListener(
          async (purchase: SubscriptionPurchase | ProductPurchase) => {
            const sub = purchase as SubscriptionPurchase;
            // Only process confirmed purchases
            if (
              sub.purchaseStateAndroid !== undefined &&
              sub.purchaseStateAndroid !== PurchaseStateAndroid.PURCHASED
            ) return;

            if (!sub.purchaseToken) return;

            try {
              const res = await api.post<{ user: Record<string, unknown> }>('/api/mobile/verify-purchase', {
                purchaseToken: sub.purchaseToken,
                productId: sub.productId,
                packageName: 'org.liravo.app',
              });

              // Acknowledge the purchase — required within 3 days or Google refunds it
              await finishTransaction({ purchase, isConsumable: false });

              // Update local user state with fresh data from backend
              if (res.user) setUser(res.user as Parameters<typeof setUser>[0]);
            } catch (err) {
              Alert.alert(
                'Purchase verification failed',
                'Your payment was received but we could not activate Premium. Please contact support with your order ID.',
              );
            }
          },
        );

        errorListenerRef.current = purchaseErrorListener((err) => {
          if ((err as { code?: string }).code !== 'E_USER_CANCELLED') {
            Alert.alert('Purchase error', err.message ?? 'Something went wrong. Please try again.');
          }
        });
      } catch (err) {
        console.warn('IAP setup failed', err);
      }
    }

    setup();

    return () => {
      mounted = false;
      purchaseListenerRef.current?.remove();
      errorListenerRef.current?.remove();
      endConnection();
    };
  }, []);

  const subscribe = useCallback(async () => {
    if (!connected) {
      Alert.alert('Store unavailable', 'Google Play Billing is not available on this device.');
      return;
    }
    setPurchasing(true);
    try {
      await requestSubscription({ sku: PREMIUM_MONTHLY_SKU });
      // Result comes through purchaseUpdatedListener, not here
    } catch (err: unknown) {
      const e = err as { code?: string; message?: string };
      if (e.code !== 'E_USER_CANCELLED') {
        Alert.alert('Purchase failed', e.message ?? 'Please try again.');
      }
    } finally {
      setPurchasing(false);
    }
  }, [connected]);

  const restorePurchases = useCallback(async () => {
    setRestoring(true);
    try {
      const purchases = await getAvailablePurchases();
      const premiumPurchase = purchases.find(
        (p) => SUBSCRIPTION_SKUS.includes(p.productId as typeof SUBSCRIPTION_SKUS[number]),
      ) as SubscriptionPurchase | undefined;

      if (!premiumPurchase?.purchaseToken) {
        Alert.alert('No active subscription found', 'If you believe this is an error, contact support.');
        return;
      }

      const res = await api.post<{ user: Record<string, unknown> }>('/api/mobile/verify-purchase', {
        purchaseToken: premiumPurchase.purchaseToken,
        productId: premiumPurchase.productId,
        packageName: 'org.liravo.app',
      });

      if (res.user) setUser(res.user as Parameters<typeof setUser>[0]);
      Alert.alert('Subscription restored!', 'Your Premium access has been restored.');
    } catch (err) {
      Alert.alert('Restore failed', (err as Error).message ?? 'Please try again.');
    } finally {
      setRestoring(false);
    }
  }, []);

  const premiumProduct = products.find((p) => p.productId === PREMIUM_MONTHLY_SKU);

  return { connected, premiumProduct, purchasing, restoring, subscribe, restorePurchases };
}

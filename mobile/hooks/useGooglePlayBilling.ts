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
  type SubscriptionAndroid,
  PurchaseStateAndroid,
} from 'react-native-iap';
import { api } from '@/lib/api';
import { useAuthStore } from '@/stores/auth';
import { SUBSCRIPTION_SKUS, PREMIUM_MONTHLY_SKU } from '@/constants/iap';
import { monthlyGooglePlayOffer } from '@/lib/google-play-offer';

export function useGooglePlayBilling() {
  const [connected, setConnected] = useState(false);
  const [products, setProducts] = useState<Subscription[]>([]);
  const [purchasing, setPurchasing] = useState(false);
  const [verifying,setVerifying] = useState(false);
  const inFlight = useRef(new Set<string>());
  const [restoring, setRestoring] = useState(false);

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

        // Listen for completed purchases (fires after user approves billing sheet)
        purchaseListenerRef.current = purchaseUpdatedListener(
          async (purchase: SubscriptionPurchase | ProductPurchase) => {
            const sub = purchase as SubscriptionPurchase;
            // Only process confirmed purchases
            if (
              sub.purchaseStateAndroid !== undefined &&
              sub.purchaseStateAndroid !== PurchaseStateAndroid.PURCHASED
            ) return;

            if (!sub.purchaseToken || !SUBSCRIPTION_SKUS.includes(sub.productId as typeof SUBSCRIPTION_SKUS[number]) || inFlight.current.has(sub.purchaseToken)) return;
            inFlight.current.add(sub.purchaseToken);
            if (mounted) setVerifying(true);

            try {
              const res = await api.post<{ user: Record<string, unknown>; active:boolean; pending:boolean; acknowledged:boolean }>('/api/mobile/verify-purchase', {
                purchaseToken: sub.purchaseToken,
                productId: sub.productId,
                packageName: 'org.liravo.app',
              });

              if (res.user && useAuthStore.getState().user?.id === res.user.id) useAuthStore.getState().setUser(res.user as Parameters<ReturnType<typeof useAuthStore.getState>['setUser']>[0]);
              if (res.pending) {
                Alert.alert('Verification pending','Your subscription is awaiting Google Play confirmation. Try restoring purchases shortly.');
                return;
              }
              if (res.active && !res.acknowledged) await finishTransaction({purchase,isConsumable:false});
              if (!res.active) Alert.alert('Subscription inactive','No active Google Play subscription was found. Your account has been refreshed.');
            } catch (err) {
              Alert.alert(
                'Purchase verification failed',
                'We could not confirm your subscription. Your purchase is retained by Google Play; try restoring purchases or contact support with your order ID.',
              );
            } finally {
              inFlight.current.delete(sub.purchaseToken);
              if (mounted) setVerifying(false);
            }
          },
        );

        errorListenerRef.current = purchaseErrorListener((err) => {
          if ((err as { code?: string }).code !== 'E_USER_CANCELLED') {
            Alert.alert('Purchase error', err.message ?? 'Something went wrong. Please try again.');
          }
        });
        const subs = await getSubscriptions({ skus: [...SUBSCRIPTION_SKUS] });
        if (mounted) setProducts(subs);
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
      const product=products.find(item=>item.productId===PREMIUM_MONTHLY_SKU) as SubscriptionAndroid | undefined;
      const offer=monthlyGooglePlayOffer(product,PREMIUM_MONTHLY_SKU);
      if (!offer) throw new Error('The monthly subscription offer is unavailable. Please try again later.');
      const {accountId}=await api.post<{accountId:string}>('/api/mobile/billing-account');
      await requestSubscription({ subscriptionOffers:[{sku:offer.sku,offerToken:offer.offerToken}],obfuscatedAccountIdAndroid:accountId });
      // Result comes through purchaseUpdatedListener, not here
    } catch (err: unknown) {
      const e = err as { code?: string; message?: string };
      if (e.code !== 'E_USER_CANCELLED') {
        Alert.alert('Purchase failed', e.message ?? 'Please try again.');
      }
    } finally {
      setPurchasing(false);
    }
  }, [connected,products]);

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

      const res = await api.post<{ user: Record<string, unknown>; active:boolean; pending:boolean; acknowledged:boolean }>('/api/mobile/verify-purchase', {
        purchaseToken: premiumPurchase.purchaseToken,
        productId: premiumPurchase.productId,
        packageName: 'org.liravo.app',
      });

      if (res.user && useAuthStore.getState().user?.id === res.user.id) useAuthStore.getState().setUser(res.user as Parameters<ReturnType<typeof useAuthStore.getState>['setUser']>[0]);
      if (res.active) Alert.alert('Subscription restored!', 'Your Premium access has been restored.');
      else Alert.alert(res.pending?'Verification pending':'Subscription inactive',res.pending?'Google Play has not confirmed this purchase yet.':'No active Google Play subscription was found.');
    } catch (err) {
      Alert.alert('Restore failed', (err as Error).message ?? 'Please try again.');
    } finally {
      setRestoring(false);
    }
  }, []);

  const premiumProduct = products.find((p) => p.productId === PREMIUM_MONTHLY_SKU);

  const premiumOffer=monthlyGooglePlayOffer(premiumProduct as SubscriptionAndroid|undefined,PREMIUM_MONTHLY_SKU);
  return { connected, premiumProduct, premiumPrice:premiumOffer?.formattedPrice??null, purchasing:purchasing||verifying, restoring, subscribe, restorePurchases };
}

import {useEffect,useState,useRef,useCallback} from 'react';
import {Platform,Alert} from 'react-native';
import {useQueryClient} from '@tanstack/react-query';
import {initConnection,endConnection,fetchProducts,requestPurchase,finishTransaction,purchaseUpdatedListener,purchaseErrorListener,getAvailablePurchases,type Purchase,type ProductSubscription,ErrorCode} from 'expo-iap';
import type {UserRow} from '@/types';
import {api} from '@/lib/api';
import {useAuthStore} from '@/stores/auth';
import {useTranslations} from '@/hooks/useTranslations';
import {SUBSCRIPTION_SKUS,PREMIUM_MONTHLY_SKU} from '@/constants/iap';
import {monthlyGooglePlayOffer} from '@/lib/google-play-offer';

let connection=Promise.resolve();
type Receipt={actorId:string;user:UserRow;active:boolean;pending:boolean;acknowledged:boolean};
export function useGooglePlayBilling(){
  const owner=useAuthStore(state=>state.user?.id),qc=useQueryClient(),{t}=useTranslations('nativeBilling'),text=useRef(t);text.current=t;
  const [connected,setConnected]=useState(false),[products,setProducts]=useState<ProductSubscription[]>([]),[connecting,setConnecting]=useState(false),[storeError,setStoreError]=useState(false),[attempt,setAttempt]=useState(0);
  const [purchasing,setPurchasing]=useState(false),[verifying,setVerifying]=useState(false),[restoring,setRestoring]=useState(false),alive=useRef(false),busy=useRef<symbol|null>(null),inFlight=useRef(new Map<string,Promise<Receipt|null>>());
  const current=useCallback(()=>!!owner&&alive.current&&useAuthStore.getState().user?.id===owner,[owner]);
  const verify=useCallback(async(purchase:Purchase):Promise<Receipt|null>=>{
    if(!current()||!purchase.purchaseToken)return null;
    const key=owner+':'+purchase.purchaseToken,existing=inFlight.current.get(key);if(existing)return existing;
    setVerifying(true);
    const operation=(async()=>{
      const result=await api.post<Receipt>('/api/mobile/verify-purchase',{purchaseToken:purchase.purchaseToken,productId:purchase.productId,packageName:'org.liravo.app'},{'X-Liravo-Actor':owner!});
      if(!current())return null;
      if(result.actorId!==owner||result.user?.id!==owner||typeof result.active!=='boolean'||typeof result.pending!=='boolean'||typeof result.acknowledged!=='boolean'||result.pending&&result.active)throw new Error('Invalid purchase receipt');
      useAuthStore.getState().setUser(result.user);
      void qc.invalidateQueries({queryKey:['premium-status',owner]});
      if(result.active&&!result.acknowledged)await finishTransaction({purchase,isConsumable:false});
      return current()?result:null;
    })();inFlight.current.set(key,operation);
    try{return await operation;}finally{inFlight.current.delete(key);if(current())setVerifying([...inFlight.current.keys()].some(key=>key.startsWith(owner+':')));}
  },[owner,current,qc]);
  useEffect(()=>{
    alive.current=true;busy.current=null;setConnected(false);setProducts([]);setStoreError(false);setPurchasing(false);setRestoring(false);setVerifying(false);
    if(Platform.OS!=='android'||!owner)return()=>{alive.current=false;};
    let mounted=true,updates:ReturnType<typeof purchaseUpdatedListener>|undefined,errors:ReturnType<typeof purchaseErrorListener>|undefined;
    setConnecting(true);
    connection=connection.catch(()=>{}).then(async()=>{
      if(!mounted)return;
      try{
        const ok=await initConnection();if(!mounted)return;if(!ok)throw new Error('Store unavailable');
        updates=purchaseUpdatedListener(purchase=>{if(!SUBSCRIPTION_SKUS.includes(purchase.productId as typeof SUBSCRIPTION_SKUS[number])||!purchase.purchaseToken||inFlight.current.has(owner+':'+purchase.purchaseToken)||purchase.purchaseState!=='purchased')return;
          void verify(purchase).then(result=>{if(!result||!current())return;if(result.pending)Alert.alert(text.current('pendingTitle'),text.current('pendingMessage'));else if(!result.active)Alert.alert(text.current('inactiveTitle'),text.current('inactiveMessage'));}).catch(()=>{if(current())Alert.alert(text.current('verificationFailedTitle'),text.current('verificationFailedMessage'));});});
        errors=purchaseErrorListener(error=>{if(current()&&error.code!==ErrorCode.UserCancelled)Alert.alert(text.current('purchaseFailedTitle'),text.current('purchaseFailedMessage'));});
        const subscriptions=await fetchProducts({skus:[...SUBSCRIPTION_SKUS],type:'subs'});if(!mounted)return;
        setProducts((subscriptions??[]).filter((item):item is ProductSubscription=>item.type==='subs'));setConnected(true);
      }catch{if(mounted)setStoreError(true);}finally{if(mounted)setConnecting(false);}
    });
    return()=>{mounted=false;alive.current=false;updates?.remove();errors?.remove();connection=connection.then(()=>endConnection()).then(()=>{},()=>{});};
  },[owner,attempt,current,verify]);
  const subscribe=useCallback(async()=>{
    if(!current()||busy.current)return;
    if(!connected){Alert.alert(text.current('storeUnavailableTitle'),text.current('storeUnavailableMessage'));return;}
    const product=products.find(item=>item.id===PREMIUM_MONTHLY_SKU),offer=monthlyGooglePlayOffer(product,PREMIUM_MONTHLY_SKU);
    if(!offer){Alert.alert(text.current('storeUnavailableTitle'),text.current('offerUnavailable'));return;}
    const lease=Symbol();busy.current=lease;setPurchasing(true);
    try{
      const result=await api.post<{actorId:string;accountId:string}>('/api/mobile/billing-account',undefined,{'X-Liravo-Actor':owner!});
      if(!current())return;if(result.actorId!==owner||!/^[a-f0-9]{64}$/.test(result.accountId))throw new Error('Invalid billing account');
      await requestPurchase({type:'subs',request:{google:{skus:[offer.sku],subscriptionOffers:[{sku:offer.sku,offerToken:offer.offerToken}],obfuscatedAccountId:result.accountId}}});
    }catch(error){if(current()&&(error as {code?:string}).code!==ErrorCode.UserCancelled)Alert.alert(text.current('purchaseFailedTitle'),text.current('purchaseFailedMessage'));}
    finally{if(busy.current===lease)busy.current=null;if(current())setPurchasing(false);}
  },[owner,current,connected,products]);
  const restorePurchases=useCallback(async()=>{
    if(!current()||busy.current)return;
    if(!connected){Alert.alert(text.current('storeUnavailableTitle'),text.current('storeUnavailableMessage'));return;}
    const lease=Symbol();busy.current=lease;setRestoring(true);
    try{
      const purchases=await getAvailablePurchases();if(!current())return;
      const seen=new Set<string>(),eligible=purchases.filter(purchase=>{if(!purchase.purchaseToken||!SUBSCRIPTION_SKUS.includes(purchase.productId as typeof SUBSCRIPTION_SKUS[number])||seen.has(purchase.purchaseToken))return false;seen.add(purchase.purchaseToken);return true;});
      let active=false,pending=false,failed=false;
      for(const purchase of eligible){if(!current())return;try{const result=await verify(purchase);if(!result)return;active=active||result.active;pending=pending||result.pending;}catch{failed=true;}}
      if(!current())return;
      if(active)Alert.alert(text.current('restoredTitle'),text.current(failed?'partiallyRestoredMessage':'restoredMessage'));
      else if(failed)Alert.alert(text.current('restoreFailedTitle'),text.current('verificationFailedMessage'));
      else if(pending)Alert.alert(text.current('pendingTitle'),text.current('pendingMessage'));
      else Alert.alert(text.current('inactiveTitle'),text.current('inactiveMessage'));
    }catch{if(current())Alert.alert(text.current('restoreFailedTitle'),text.current('verificationFailedMessage'));}
    finally{if(busy.current===lease)busy.current=null;if(current())setRestoring(false);}
  },[current,connected,verify]);
  const premiumProduct=products.find(product=>product.id===PREMIUM_MONTHLY_SKU),offer=monthlyGooglePlayOffer(premiumProduct,PREMIUM_MONTHLY_SKU);
  return{connected,connecting,storeError,premiumProduct,premiumPrice:offer?.formattedPrice??null,purchasing:purchasing||verifying,restoring,subscribe,restorePurchases,retryStore:()=>{if(current()&&!busy.current)setAttempt(value=>value+1);}};
}

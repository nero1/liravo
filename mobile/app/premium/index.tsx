import {useTranslations} from '@/hooks/useTranslations';
import {View,Text,ScrollView,Platform,Alert} from 'react-native';
import {SafeAreaView} from 'react-native-safe-area-context';
import {useQuery} from '@tanstack/react-query';
import * as WebBrowser from 'expo-web-browser';
import {useAuthStore} from '@/stores/auth';
import {api} from '@/lib/api';
import {API_BASE} from '@/constants/api';
import {Card} from '@/components/ui/Card';
import {Button} from '@/components/ui/Button';
import {QueryError} from '@/components/ui/EmptyState';
import {useGooglePlayBilling} from '@/hooks/useGooglePlayBilling';

type PremiumStatus={actorId:string;active:boolean;googlePlayManageUrl:string;subscriptions:{provider:string;paidUntil:string|null;renewalCancelled:boolean}[]};
const FEATURES=['shelves','stats','taste','feedback','plan','digest','badge'] as const;
export default function PremiumScreen(){
  const {t,locale}=useTranslations('premium'),billing=useTranslations('nativeBilling'),common=useTranslations('common'),user=useAuthStore(state=>state.user),owner=user?.id;
  const play=useGooglePlayBilling(),{data,error,isLoading,isFetching,refetch}=useQuery({queryKey:['premium-status',owner],enabled:!!owner,queryFn:async({signal})=>{
    const result=await api.get<PremiumStatus>('/api/subscriptions/status',undefined,signal);if(result.actorId!==owner||useAuthStore.getState().user?.id!==owner||typeof result.active!=='boolean'||!Array.isArray(result.subscriptions))throw new Error('Invalid Premium status');return result;
  }});
  if(error)return <QueryError error={error} retry={()=>void refetch()}/>;
  if(isLoading||!data)return <SafeAreaView className="flex-1 bg-background p-4" edges={['bottom']}><Text className="text-muted-foreground" accessibilityLiveRegion="polite">{common.t('loading')}</Text></SafeAreaView>;
  const active=data.active,busy=play.purchasing||play.restoring||isFetching,android=Platform.OS==='android',paidUntil=data.subscriptions.map(subscription=>subscription.paidUntil).filter((date):date is string=>!!date).sort((a,b)=>Date.parse(a)-Date.parse(b)).at(-1),googleManaged=data.subscriptions.some(subscription=>subscription.provider==='google_play');
  async function manage(){
    if(useAuthStore.getState().user?.id!==owner)return;
    try{const url=new URL(googleManaged?data!.googlePlayManageUrl:'/premium',API_BASE);if(googleManaged&&(url.protocol!=='https:'||url.hostname!=='play.google.com'))throw new Error('Invalid management link');await WebBrowser.openBrowserAsync(url.href);}
    catch{Alert.alert(common.t('error'),billing.t('openFailed'));}
  }
  return <SafeAreaView className="flex-1 bg-background" edges={['bottom']}><ScrollView className="px-4" contentContainerStyle={{paddingTop:16,paddingBottom:32,gap:16}}>
    <View className="items-center gap-2"><Text className="text-4xl">★</Text><Text className="text-3xl font-bold text-foreground">{t('title')}</Text><Text className="text-muted-foreground text-center">{t('subtitle')}</Text></View>
    {active?<Card className="items-center gap-2 py-6"><Text className="font-bold text-lg text-foreground">{t('activeTitle')}</Text><Text className="text-muted-foreground text-center">{t('activeMessage',{name:user?.display_name??t('reader')})}</Text>{paidUntil&&<Text className="text-muted-foreground text-sm">{t('paidUntil',{date:new Intl.DateTimeFormat(locale,{dateStyle:'long',timeZone:'UTC'}).format(new Date(paidUntil))})}</Text>}<Button variant="outline" disabled={busy} onPress={()=>void manage()}>{t('manage')}</Button></Card>:<Card className="gap-3"><Text className="text-2xl font-bold text-foreground text-center">{play.premiumPrice?billing.t('monthlyPrice',{price:play.premiumPrice}):billing.t('priceUnavailable')}</Text>{FEATURES.map(feature=><Text key={feature} className="text-foreground">✓ {t('features.'+feature+'.label')}</Text>)}</Card>}
    {android?<>
      {play.connecting&&<Text className="text-muted-foreground" accessibilityLiveRegion="polite">{common.t('loading')}</Text>}
      {(play.storeError||!play.connecting&&(!play.connected||!play.premiumPrice&&!active))&&<View className="gap-2" accessibilityLiveRegion="polite"><Text className="text-muted-foreground">{billing.t(play.connected?'offerUnavailable':'storeUnavailableMessage')}</Text><Button variant="outline" disabled={busy} onPress={play.retryStore}>{common.t('retry')}</Button></View>}
      {!active&&<Button onPress={()=>void play.subscribe()} disabled={!play.connected||!play.premiumPrice||busy} loading={play.purchasing}>{play.premiumPrice?billing.t('subscribe',{price:play.premiumPrice}):billing.t('priceUnavailable')}</Button>}
      <Button variant="outline" onPress={()=>void play.restorePurchases()} disabled={!play.connected||busy} loading={play.restoring}>{billing.t('restore')}</Button>
      {!active&&<Text className="text-center text-xs text-muted-foreground">{billing.t('terms')}</Text>}
    </>:<Text className="text-muted-foreground">{billing.t('storeUnavailableMessage')}</Text>}
    <Button variant="ghost" onPress={()=>void refetch()} disabled={busy} loading={isFetching}>{billing.t('refreshStatus')}</Button>
  </ScrollView></SafeAreaView>;
}

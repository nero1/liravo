import {View,Text,ScrollView,TouchableOpacity,Share,Alert,ActivityIndicator} from 'react-native';
import {SafeAreaView} from 'react-native-safe-area-context';
import {useQuery} from '@tanstack/react-query';
import {api} from '@/lib/api';
import {API_BASE,ENDPOINTS} from '@/constants/api';
import {Card} from '@/components/ui/Card';
import {QueryError} from '@/components/ui/EmptyState';
import {useTranslations} from '@/hooks/useTranslations';
interface Statistics {referralCode:string|null;referralCount:number;xpFromReferrals:number;earnedByCurrency:Record<string,string>;}
export default function ReferralScreen(){
  const {t,locale}=useTranslations('referrals'),{t:common}=useTranslations('common');
  const {data,isLoading,error,refetch}=useQuery({queryKey:['referral','stats'],queryFn:({signal})=>api.get<Statistics>(ENDPOINTS.referral.stats,undefined,signal)});
  if(error)return <QueryError error={error} retry={()=>void refetch()}/>;
  if(isLoading||!data)return <View className="flex-1 items-center justify-center bg-background"><ActivityIndicator color="#d97706"/></View>;
  const referralLink=new URL('/?ref='+encodeURIComponent(data.referralCode??''),API_BASE).href;
  async function share(){try{await Share.share({message:t('shareMessage',{url:referralLink}),url:referralLink});}catch{Alert.alert(common('error'),t('shareFailed'));}}
  return <SafeAreaView className="flex-1 bg-background" edges={['bottom']}><ScrollView className="px-4" contentContainerStyle={{paddingTop:16,paddingBottom:32,gap:16}}>
    <Card className="gap-2"><Text accessibilityRole="header" className="font-semibold text-foreground">{t('code')}</Text><Text className="text-2xl font-bold text-accent">{data.referralCode}</Text><Text className="text-sm text-muted-foreground">{t('terms')}</Text></Card>
    <Card className="gap-2"><Text className="font-bold text-2xl text-foreground">{data.referralCount.toLocaleString(locale)}</Text><Text className="text-muted-foreground">{t('count')}</Text><Text className="text-foreground">{t('xp',{count:data.xpFromReferrals})}</Text></Card>
    <Card className="gap-2"><Text accessibilityRole="header" className="font-semibold text-foreground">{t('earned')}</Text>{Object.keys(data.earnedByCurrency).length?Object.entries(data.earnedByCurrency).map(([currency,amount])=><Text key={currency} className="text-foreground">{new Intl.NumberFormat(locale,{style:'currency',currency,minimumFractionDigits:2,maximumFractionDigits:4}).format(Number(amount))}</Text>):<Text className="text-muted-foreground">{t('noEarnings')}</Text>}</Card>
    <TouchableOpacity accessibilityRole="button" disabled={!data.referralCode} onPress={()=>void share()} className="bg-accent rounded-xl py-4 items-center"><Text className="text-accent-foreground font-semibold">{t('share')}</Text></TouchableOpacity>
  </ScrollView></SafeAreaView>;
}

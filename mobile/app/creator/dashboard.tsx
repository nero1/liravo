import {View,Text,ScrollView,ActivityIndicator} from 'react-native';
import {SafeAreaView} from 'react-native-safe-area-context';
import {useQuery} from '@tanstack/react-query';
import {useRouter} from 'expo-router';
import {api} from '@/lib/api';
import {ENDPOINTS} from '@/constants/api';
import {useAuthStore} from '@/stores/auth';
import {useTranslations} from '@/hooks/useTranslations';
import {Card} from '@/components/ui/Card';
import {Button} from '@/components/ui/Button';

type Analytics={follower_count:number;review_count:number;want_to_read_triggered:number;tips_received_by_currency:Record<'USD'|'NGN'|'EUR',number>};
export default function CreatorDashboardScreen(){
  const {t,locale}=useTranslations('creator'),common=useTranslations('common'),user=useAuthStore(state=>state.user),router=useRouter(),allowed=!!user&&(user.is_creator||user.user_types.includes('creator'));
  const {data,isLoading,error,refetch}=useQuery({queryKey:['creator','analytics',user?.id],queryFn:()=>api.get<Analytics>(ENDPOINTS.creator.analytics),enabled:allowed});
  if(!allowed)return <View className="flex-1 justify-center p-6 gap-4"><Text className="text-foreground">{t('accessDescription')}</Text><Button onPress={()=>router.push('/profile/edit')}>{t('settings')}</Button></View>;
  if(isLoading)return <View className="flex-1 items-center justify-center bg-background"><ActivityIndicator color="#d97706" accessibilityLabel={common.t('loading')}/></View>;
  if(error||!data)return <View className="flex-1 justify-center p-6 gap-4"><Text accessibilityLiveRegion="polite" className="text-destructive">{t('unavailable')}</Text><Button onPress={()=>void refetch()}>{common.t('retry')}</Button></View>;
  const stats=[{label:t('followers'),value:data.follower_count.toLocaleString(locale)},{label:t('reviews'),value:data.review_count.toLocaleString(locale)},{label:t('conversions'),value:data.want_to_read_triggered.toLocaleString(locale)},...Object.entries(data.tips_received_by_currency).map(([currency,amount])=>({label:t('tips',{currency}),value:new Intl.NumberFormat(locale,{style:'currency',currency}).format(amount)}))];
  return <SafeAreaView className="flex-1 bg-background" edges={['bottom']}><ScrollView className="px-4" contentContainerStyle={{paddingTop:16,paddingBottom:32,gap:16}}><Text accessibilityRole="header" className="text-2xl font-bold text-foreground">{t('dashboard')}</Text><Text className="text-muted-foreground">{t('description')}</Text>{stats.map(stat=><Card key={stat.label}><Text className="font-semibold text-foreground mb-2">{stat.label}</Text><Text className="text-3xl font-bold text-foreground">{stat.value}</Text></Card>)}<Button variant="outline" onPress={()=>router.push('/creator/leaderboard')}>{t('leaderboard')}</Button></ScrollView></SafeAreaView>;
}

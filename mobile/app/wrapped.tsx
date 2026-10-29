import {View,Text,ScrollView,ActivityIndicator} from 'react-native';
import {SafeAreaView} from 'react-native-safe-area-context';
import {useQuery} from '@tanstack/react-query';
import {api} from '@/lib/api';
import {useAuthStore} from '@/stores/auth';
import {useTranslations} from '@/hooks/useTranslations';
import {Card} from '@/components/ui/Card';
import {Button} from '@/components/ui/Button';
import {QueryError} from '@/components/ui/EmptyState';
import type {WrappedData} from '@/types';
export default function WrappedScreen(){
  const owner=useAuthStore(state=>state.user?.id),{t,locale}=useTranslations('wrapped'),genres=useTranslations('aiProfiles'),moods=useTranslations('moods'),levels=useTranslations('profile'),query=useQuery({queryKey:['wrapped',owner],enabled:!!owner,queryFn:async({signal})=>{const data=await api.get<WrappedData&{actorId:string}>('/api/wrapped',undefined,signal);if(data.actorId!==owner||data.userId!==owner||!Array.isArray(data.topGenres))throw Error('Invalid reading summary');return data;}});
  if(query.error)return <QueryError error={query.error} retry={()=>void query.refetch()}/>;
  const data=query.data;if(!data)return <View className="flex-1 items-center justify-center bg-background"><ActivityIndicator color="#d97706"/></View>;
  const number=(value:number)=>new Intl.NumberFormat(locale).format(value),genre=(value:string)=>genres.has('genreLabels.'+value)?genres.t('genreLabels.'+value):value,cards=[
    {label:t('booksRead'),value:number(data.booksRead)},{label:t('pagesRead'),value:number(data.pagesRead)},
    {label:t('maximumStreak'),value:number(data.streakMax)},{label:t('badgesEarned'),value:number(data.badgesEarned)},
    {label:t('yearXp'),value:number(data.yearXp)},{label:t('totalXp'),value:number(data.totalXp)},
  ];
  return <SafeAreaView className="flex-1 bg-background" edges={['bottom']}><ScrollView className="px-4" contentContainerStyle={{paddingTop:16,paddingBottom:32,gap:16}}><Text accessibilityRole="header" className="text-2xl font-bold text-foreground">{t('yearTitle',{year:data.year})}</Text><Text className="text-foreground">{t('greeting',{name:data.displayName})}</Text><Text className="font-semibold text-accent">{levels.t('levels.'+data.readerLevel)}</Text>{cards.map(card=><Card key={card.label}><Text className="text-3xl font-bold text-foreground">{card.value}</Text><Text className="text-sm text-muted-foreground">{card.label}</Text></Card>)}{data.topGenres.length>0&&<Card><Text className="font-semibold text-foreground">{t('topGenres')}</Text>{data.topGenres.map(value=><Text key={value} className="text-foreground">{genre(value)}</Text>)}</Card>}{data.topMood&&<Card><Text className="font-semibold text-foreground">{t('topMood')}</Text><Text className="text-foreground">{moods.has(data.topMood)?moods.t(data.topMood):data.topMood}</Text><Text className="text-xs text-muted-foreground">{t('moodDescription')}</Text></Card>}{data.favouriteAuthor&&<Card><Text className="font-semibold text-foreground">{t('favouriteAuthor')}</Text><Text className="text-foreground">{data.favouriteAuthor}</Text></Card>}{data.mostActiveMonthNumber&&<Card><Text className="font-semibold text-foreground">{t('mostActiveMonth')}</Text><Text className="text-foreground">{new Intl.DateTimeFormat(locale,{month:'long',timeZone:'UTC'}).format(new Date(Date.UTC(data.year,data.mostActiveMonthNumber-1,1)))}</Text></Card>}{(['longestBook','shortestBook'] as const).map(key=>data[key]&&<Card key={key}><Text className="font-semibold text-foreground">{t(key)}</Text><Text className="text-foreground">{data[key]!.title} · {t('pageCount',{count:data[key]!.pageCount})}</Text></Card>)}<Button variant="outline" loading={query.isRefetching} onPress={()=>void query.refetch()}>{t('refresh')}</Button></ScrollView></SafeAreaView>;
}
